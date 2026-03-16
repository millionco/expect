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

const MOUSE_ENABLE = "\u001b[?1003l\u001b[?1002l\u001b[?1000h\u001b[?1006h";
const MOUSE_DISABLE = "\u001b[?1000l\u001b[?1006l\u001b[?1003l\u001b[?1002l";
// oxlint-disable-next-line no-control-regex
const ALL_TERMINAL_SEQUENCES =
  /\x1b\[<(\d+);(\d+);(\d+)([Mm])|\x1b\[[\d;?<>=]*[A-Za-z~]|\[<[\d;]+[Mm]|\[\d+;\d+R|\[\?[\d;]+[a-z]/g;

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

        const cleaned = text.replace(
          ALL_TERMINAL_SEQUENCES,
          (_match, buttonCode, xCoord, yCoord, terminator) => {
            if (buttonCode === "0") {
              for (const handler of handlersRef.current) {
                handler(
                  { x: Number(xCoord), y: Number(yCoord) },
                  terminator === "M" ? "press" : "release",
                );
              }
            }
            return "";
          },
        );
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

const TERMINAL_RESPONSE_GARBAGE =
  // oxlint-disable-next-line no-control-regex
  /\x1b\[[\d;?<>=]*[A-Za-z~]|\[<[\d;]+[Mm]|\[\?[\d;]+[a-z]|\[\d+;\d+R/g;

export const stripMouseSequences = (value: string): string =>
  CLICK_SUPPORT_ENABLED ? value.replace(TERMINAL_RESPONSE_GARBAGE, "") : value;
