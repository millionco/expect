import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { DOMElement } from "ink";
import type { ElementInfo } from "element-source";
import { resolveElementInfo } from "element-source";
import { hitTest } from "./hit-test.js";
import { createMouseTracking } from "./mouse-tracking.js";
import { copyToClipboard } from "./copy-to-clipboard.js";
import { SourcePanel } from "./source-panel.js";
import { COPIED_FLASH_DURATION_MS } from "./constants.js";
import type { ReactNode } from "react";

type InspectorMode = "idle" | "picking";

interface SourceInspectorProps {
  children: ReactNode;
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const SourceInspector = ({ children }: SourceInspectorProps) => {
  if (IS_PRODUCTION) return <>{children}</>;

  const rootRef = useRef<DOMElement>(null);
  const buttonRef = useRef<DOMElement>(null);
  const modeRef = useRef<InspectorMode>("idle");
  const [mode, setMode] = useState<InspectorMode>("idle");
  const [elementInfo, setElementInfo] = useState<ElementInfo | null>(null);
  const [copied, setCopied] = useState(false);

  modeRef.current = mode;

  useEffect(() => {
    if (copied) {
      const timeout = setTimeout(() => setCopied(false), COPIED_FLASH_DURATION_MS);
      return () => clearTimeout(timeout);
    }
  }, [copied]);

  useEffect(() => {
    let cancelled = false;
    const mouse = createMouseTracking();

    mouse.on("click", (_press, release) => {
      if (cancelled || !rootRef.current) return;

      const clickX = release.x - 1;
      const clickY = release.y - 1;

      if (modeRef.current === "idle") {
        if (buttonRef.current) {
          const buttonHit = hitTest(buttonRef.current, clickX, clickY);
          if (buttonHit) {
            setElementInfo(null);
            setCopied(false);
            setMode("picking");
          }
        }
        return;
      }

      if (buttonRef.current) {
        const buttonHit = hitTest(buttonRef.current, clickX, clickY);
        if (buttonHit) {
          setMode("idle");
          setElementInfo(null);
          return;
        }
      }

      const element = hitTest(rootRef.current, clickX, clickY);
      if (!element) return;

      void resolveElementInfo(element).then((info) => {
        if (!cancelled) setElementInfo(info);
      });
    });

    mouse.start();

    return () => {
      cancelled = true;
      mouse.stop();
    };
  }, []);

  const handleCopy = useCallback(() => {
    if (!elementInfo?.source) return;
    const parts = [elementInfo.source.filePath];
    if (elementInfo.source.lineNumber !== null) parts.push(String(elementInfo.source.lineNumber));
    if (elementInfo.source.columnNumber !== null)
      parts.push(String(elementInfo.source.columnNumber));
    const success = copyToClipboard(parts.join(":"));
    if (success) setCopied(true);
  }, [elementInfo]);

  useInput((input, key) => {
    if (mode === "picking") {
      if (key.escape) {
        setMode("idle");
        setElementInfo(null);
        return;
      }
      if (input === "c" && elementInfo) {
        handleCopy();
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" ref={rootRef}>
      {children}

      <Box justifyContent="flex-end" paddingX={1} ref={buttonRef}>
        <Text dimColor inverse={mode === "picking"}>
          {mode === "idle" ? " 🔍 inspect " : " ✕ exit inspect "}
        </Text>
      </Box>

      {mode === "picking" ? (
        <Box flexDirection="column" paddingX={1}>
          {elementInfo ? (
            <SourcePanel info={elementInfo} copied={copied} />
          ) : (
            <Text dimColor>Click an element to inspect</Text>
          )}
        </Box>
      ) : null}
    </Box>
  );
};
