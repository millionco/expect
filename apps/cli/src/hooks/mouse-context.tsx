import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { CLICK_SUPPORT_ENABLED } from "../constants.js";

interface MousePosition {
  x: number;
  y: number;
}

type MouseClickAction = "press" | "release";

interface ClickHandler {
  (position: MousePosition, action: MouseClickAction): void;
}

interface MouseContextValue {
  subscribeClick: (handler: ClickHandler) => () => void;
}

const NOOP_UNSUBSCRIBE = () => {};
const NOOP_CONTEXT: MouseContextValue = { subscribeClick: () => NOOP_UNSUBSCRIBE };

const MouseContext = createContext<MouseContextValue>(NOOP_CONTEXT);

const MOUSE_ENABLE = "\u001b[?1000h\u001b[?1006h";
const MOUSE_DISABLE = "\u001b[?1000l\u001b[?1006l";
// oxlint-disable-next-line no-control-regex
const SGR_MOUSE_SEQUENCE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

export const MouseProvider = ({ children }: { children: React.ReactNode }) => {
  if (!CLICK_SUPPORT_ENABLED) return <>{children}</>;

  const handlersRef = useRef(new Set<ClickHandler>());

  useEffect(() => {
    process.stdout.write(MOUSE_ENABLE);

    // HACK: override emit so SGR mouse sequences are stripped before ink's useInput sees them
    const originalEmit = process.stdin.emit.bind(process.stdin);
    process.stdin.emit = function (event: string | symbol, ...eventArgs: unknown[]) {
      if (event === "data") {
        const text = typeof eventArgs[0] === "string" ? eventArgs[0] : String(eventArgs[0]);

        for (const match of text.matchAll(SGR_MOUSE_SEQUENCE)) {
          if (match[1] === "0") {
            for (const handler of handlersRef.current) {
              handler(
                { x: Number(match[2]), y: Number(match[3]) },
                match[4] === "M" ? "press" : "release",
              );
            }
          }
        }

        const cleaned = text.replace(SGR_MOUSE_SEQUENCE, "");
        if (cleaned.length === 0) return true;
        return originalEmit(event, cleaned);
      }
      return originalEmit(event, ...eventArgs);
    };

    return () => {
      process.stdin.emit = originalEmit;
      process.stdout.write(MOUSE_DISABLE);
    };
  }, []);

  const subscribeClick = useCallback((handler: ClickHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return <MouseContext.Provider value={{ subscribeClick }}>{children}</MouseContext.Provider>;
};

export const useMouse = (): MouseContextValue => useContext(MouseContext);

// oxlint-disable-next-line no-control-regex
const SGR_MOUSE_GARBAGE = /\u001b\[?<?(\d+;)*\d+[Mm]?|\[<(\d+;)*\d+[Mm]?/g;

export const stripMouseSequences = (value: string): string =>
  CLICK_SUPPORT_ENABLED ? value.replace(SGR_MOUSE_GARBAGE, "") : value;
