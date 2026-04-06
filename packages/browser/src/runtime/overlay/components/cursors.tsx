import type { CursorShape } from "../lib/constants";
import { PointerCursor } from "./cursor-pointer";
import { TextCursor } from "./cursor-text";
import { HandCursor } from "./cursor-hand";
import { HandCursor as GrabCursor } from "./cursor-hand";

const CLICKABLE_SELECTOR =
  'a,button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],select,summary,label[for]';

export const detectCursorShape = (x: number, y: number): CursorShape => {
  const element = document.elementFromPoint(x, y);
  if (!element) return "pointer";

  const computedCursor = window.getComputedStyle(element).cursor;
  if (computedCursor === "text") return "text";
  if (computedCursor === "grab" || computedCursor === "grabbing") return "grab";
  if (computedCursor === "pointer") return "hand";

  if (element.closest(CLICKABLE_SELECTOR)) return "hand";

  const tag = element.tagName;
  if (tag === "TEXTAREA" || (element instanceof HTMLElement && element.isContentEditable))
    return "text";
  if (tag === "INPUT" && element instanceof HTMLInputElement) {
    const inputType = element.type;
    if (
      inputType === "text" ||
      inputType === "search" ||
      inputType === "email" ||
      inputType === "url" ||
      inputType === "tel" ||
      inputType === "password" ||
      inputType === "number" ||
      inputType === ""
    )
      return "text";
    return "hand";
  }

  return "pointer";
};

export const CursorIcon = ({ shape }: { shape: CursorShape }) => {
  if (shape === "text") return <TextCursor />;
  if (shape === "hand") return <HandCursor />;
  if (shape === "grab") return <GrabCursor />;
  return <PointerCursor />;
};
