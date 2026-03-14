import { useEffect, useRef, useState } from "react";
import { Box, Text, useStdin, useStdout } from "ink";
import type { DOMElement } from "ink";
import type { EventEmitter } from "node:events";
import type { ReactNode } from "react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isCompositeFiber, getDisplayName } from "bippy";
import type { Fiber, FiberRoot } from "bippy";
import { getOwnerStack, symbolicateStack, isSourceFile } from "bippy/source";
import type { StackFrame } from "bippy/source";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SGR_PREFIX = "\x1b[<";
const CSI_PREFIX = "\x1b[";
const MOUSE_ENABLE = "\x1b[?1003h\x1b[?1006h";
const MOUSE_DISABLE = "\x1b[?1003l\x1b[?1006l";
const CURSOR_QUERY = "\x1b[6n";
const CALIBRATION_DELAY_MS = 100;
const TEXT_PREVIEW_MAX_CHARS = 50;

const INK_INTERNAL_NAMES = new Set([
  "Box", "Text", "Static", "Transform", "Newline", "Spacer",
  "App", "StdinContext", "StdoutContext", "StderrContext",
  "FocusContext", "AccessibilityContext", "ThemeContext",
]);

interface TerminalMouseEvent {
  x: number;
  y: number;
  isMove: boolean;
  meta: boolean;
}

const parseMouseSequence = (sequence: string): TerminalMouseEvent | null => {
  if (!sequence.startsWith(SGR_PREFIX)) return null;
  const terminator = sequence[sequence.length - 1];
  if (terminator !== "M" && terminator !== "m") return null;
  const parts = sequence.slice(SGR_PREFIX.length, -1).split(";");
  if (parts.length !== 3) return null;
  const buttonCode = Number(parts[0]);
  const xCoordinate = Number(parts[1]);
  const yCoordinate = Number(parts[2]);
  if (!Number.isFinite(buttonCode) || !Number.isFinite(xCoordinate) || !Number.isFinite(yCoordinate)) return null;
  return { x: xCoordinate, y: yCoordinate, isMove: Boolean(buttonCode & 32), meta: Boolean(buttonCode & 8) };
};

const parseCursorPosition = (data: string): number | null => {
  if (!data.startsWith(CSI_PREFIX) || !data.endsWith("R")) return null;
  const parts = data.slice(CSI_PREFIX.length, -1).split(";");
  if (parts.length !== 2) return null;
  const row = Number(parts[0]);
  return Number.isFinite(row) ? row : null;
};

const isDOMElement = (node: unknown): node is DOMElement =>
  node !== null &&
  typeof node === "object" &&
  "nodeName" in node &&
  "childNodes" in node &&
  Array.isArray((node as DOMElement).childNodes);

const collectTextContent = (node: DOMElement): string => {
  const parts: string[] = [];
  for (const child of node.childNodes) {
    if (isDOMElement(child)) {
      parts.push(collectTextContent(child));
    } else if ("nodeValue" in child && typeof child.nodeValue === "string") {
      parts.push(child.nodeValue);
    }
  }
  return parts.join("");
};

const truncatePreview = (text: string, maxLength: number): string => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
};

const findDeepestElement = (
  node: DOMElement, absoluteX: number, absoluteY: number, targetX: number, targetY: number,
): DOMElement | null => {
  const yogaNode = node.yogaNode;
  if (!yogaNode) return null;
  const nodeLeft = absoluteX + yogaNode.getComputedLeft();
  const nodeTop = absoluteY + yogaNode.getComputedTop();
  const withinBounds =
    targetX >= nodeLeft && targetX < nodeLeft + yogaNode.getComputedWidth() &&
    targetY >= nodeTop && targetY < nodeTop + yogaNode.getComputedHeight();
  if (!withinBounds) return null;
  for (const child of node.childNodes) {
    if (isDOMElement(child)) {
      const deeper = findDeepestElement(child, nodeLeft, nodeTop, targetX, targetY);
      if (deeper) return deeper;
    }
  }
  return node;
};

const hitTest = (root: DOMElement, terminalX: number, terminalY: number, verticalOffset: number): DOMElement | null =>
  findDeepestElement(root, 0, 0, terminalX, terminalY - verticalOffset);

const localFetch = async (url: string): Promise<Response> => {
  try {
    const filePath = url.startsWith("file://") ? fileURLToPath(url) : url;
    return new Response(readFileSync(filePath, "utf-8"), { status: 200 });
  } catch {
    return new Response("", { status: 404 });
  }
};

// HACK: _fiberRoots lives on the injected hook (inject-hook.js), not bippy's internal set.
const getFiberRoots = (): Set<FiberRoot> => {
  const hook = (globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ as
    | { _fiberRoots?: Set<FiberRoot> }
    | undefined;
  return hook?._fiberRoots ?? new Set();
};

const findFiberForNode = (fiber: Fiber, target: DOMElement): Fiber | null => {
  if (fiber.stateNode === target) return fiber;
  let child = fiber.child;
  while (child) {
    const found = findFiberForNode(child, target);
    if (found) return found;
    child = child.sibling;
  }
  return null;
};

const findNearestUserComponent = (fiber: Fiber): { name: string; fiber: Fiber } | null => {
  let inkFallback: { name: string; fiber: Fiber } | null = null;
  let current: Fiber | null = fiber.return;
  while (current) {
    if (isCompositeFiber(current)) {
      const name = getDisplayName(current.type);
      if (name && name.length >= 2 && !name.startsWith("_")) {
        if (!INK_INTERNAL_NAMES.has(name)) return { name, fiber: current };
        inkFallback ??= { name, fiber: current };
      }
    }
    current = current.return;
  }
  return inkFallback;
};

// HACK: bippy rejects file:// URLs in isSourceFile, so strip the protocol before symbolication.
const stripFileProtocol = (frames: StackFrame[]): StackFrame[] =>
  frames.map((frame) => ({
    ...frame,
    fileName: frame.fileName?.startsWith("file://") ? fileURLToPath(frame.fileName) : frame.fileName,
  }));

const formatSource = (frame: StackFrame): string => {
  const parts = [frame.fileName!];
  if (frame.lineNumber != null) parts.push(String(frame.lineNumber));
  if (frame.columnNumber != null) parts.push(String(frame.columnNumber));
  return parts.join(":");
};

const resolveInkElement = async (node: DOMElement): Promise<string> => {
  const tagName = node.nodeName ?? "";
  const textPreview = truncatePreview(collectTextContent(node), TEXT_PREVIEW_MAX_CHARS);
  const previewSuffix = textPreview ? ` "${textPreview}"` : "";
  for (const root of getFiberRoots()) {
    const fiber = findFiberForNode(root.current, node);
    if (!fiber) continue;
    const component = findNearestUserComponent(fiber);
    if (!component) return `<${tagName}>${previewSuffix}`;
    const rawStack = await getOwnerStack(component.fiber, true, localFetch);
    const symbolicated = await symbolicateStack(stripFileProtocol(rawStack), true, localFetch);
    const sourceFrame = symbolicated.find((frame) => frame.fileName && isSourceFile(frame.fileName));
    return sourceFrame
      ? `<${component.name}>${previewSuffix} ${formatSource(sourceFrame)}`
      : `<${component.name}>${previewSuffix} (${tagName})`;
  }
  return `<${tagName}>${previewSuffix}`;
};

const copyToClipboard = (text: string): void => {
  try { execSync("pbcopy", { input: text, stdio: ["pipe", "ignore", "ignore"] }); } catch {}
};

interface InkGrabProps {
  children: ReactNode;
}

export const InkGrab = ({ children }: InkGrabProps) => {
  if (IS_PRODUCTION) return <>{children}</>;

  const { stdout } = useStdout();
  const stdinContext = useStdin();
  // HACK: Ink does not expose internal_eventEmitter in its public types.
  const internalEmitter = (stdinContext as unknown as { internal_eventEmitter: EventEmitter })
    .internal_eventEmitter;

  const rootRef = useRef<DOMElement>(null);
  const verticalOffsetRef = useRef<number | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    stdout.write(MOUSE_ENABLE);

    const handleInput = (data: string) => {
      if (cancelled) return;

      const cursorRow = parseCursorPosition(data);
      if (cursorRow !== null) {
        const contentHeight = rootRef.current?.yogaNode?.getComputedHeight() ?? 0;
        verticalOffsetRef.current = cursorRow - 1 - contentHeight;
        return;
      }

      const mouseEvent = parseMouseSequence(data);
      if (!mouseEvent || !rootRef.current) return;

      if (mouseEvent.meta) {
        if (verticalOffsetRef.current === null) {
          stdout.write(CURSOR_QUERY);
          return;
        }

        const element = hitTest(rootRef.current, mouseEvent.x - 1, mouseEvent.y - 1, verticalOffsetRef.current);
        if (!element) {
          if (mouseEvent.isMove) setHoveredLabel(null);
          return;
        }

        void resolveInkElement(element).then((label) => {
          if (cancelled) return;
          setHoveredLabel(label);
          if (!mouseEvent.isMove) copyToClipboard(label);
        });
        return;
      }

      if (mouseEvent.isMove) setHoveredLabel(null);
    };

    internalEmitter.on("input", handleInput);
    setTimeout(() => { if (!cancelled) stdout.write(CURSOR_QUERY); }, CALIBRATION_DELAY_MS);

    return () => {
      cancelled = true;
      stdout.write(MOUSE_DISABLE);
      internalEmitter.removeListener("input", handleInput);
    };
  }, [stdout, internalEmitter]);

  return (
    <Box flexDirection="column" ref={rootRef}>
      {children}
      {hoveredLabel ? (
        <Box justifyContent="flex-end" paddingX={1}>
          <Text dimColor>{hoveredLabel}</Text>
        </Box>
      ) : null}
    </Box>
  );
};
