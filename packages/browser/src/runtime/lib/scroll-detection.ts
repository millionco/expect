const SCROLL_OVERFLOW_THRESHOLD_PX = 10;
const MIN_SCROLLABLE_CHILDREN = 5;
const HIDDEN_MARKER_ATTR = "data-expect-scroll-hidden";
const PREV_ARIA_HIDDEN_ATTR = "data-expect-prev-aria-hidden";
const MARKER_ELEMENT_ATTR = "data-expect-scroll-marker";
const MARKER_STYLE = "position:absolute;width:0;height:0;overflow:hidden;";

export interface ScrollContainerResult {
  totalChildren: number;
  hiddenAbove: number;
  hiddenBelow: number;
}

const hideChild = (child: Element, direction: "above" | "below") => {
  const previous = child.getAttribute("aria-hidden");
  if (previous) child.setAttribute(PREV_ARIA_HIDDEN_ATTR, previous);
  child.setAttribute("aria-hidden", "true");
  child.setAttribute(HIDDEN_MARKER_ATTR, direction);
};

const insertMarker = (parent: Element, label: string, before: Element | null) => {
  const marker = document.createElement("div");
  marker.setAttribute("role", "note");
  marker.setAttribute("aria-label", label);
  marker.setAttribute(MARKER_ELEMENT_ATTR, "true");
  marker.style.cssText = MARKER_STYLE;
  if (before) {
    parent.insertBefore(marker, before);
  } else {
    parent.appendChild(marker);
  }
};

export const prepareViewportSnapshot = (): ScrollContainerResult[] => {
  const results: ScrollContainerResult[] = [];

  for (const element of document.querySelectorAll("*")) {
    if (element.scrollHeight <= element.clientHeight + SCROLL_OVERFLOW_THRESHOLD_PX) continue;

    const style = getComputedStyle(element);
    if (style.overflowY === "hidden" || style.overflowY === "visible") continue;

    const children = Array.from(element.children);
    if (children.length < MIN_SCROLLABLE_CHILDREN) continue;

    const containerRect = element.getBoundingClientRect();
    let hiddenAbove = 0;
    let hiddenBelow = 0;
    let firstVisibleChild: Element | undefined;
    let lastVisibleChild: Element | undefined;

    for (const child of children) {
      const childRect = child.getBoundingClientRect();
      if (childRect.bottom < containerRect.top) {
        hideChild(child, "above");
        hiddenAbove++;
      } else if (childRect.top > containerRect.bottom) {
        hideChild(child, "below");
        hiddenBelow++;
      } else {
        if (!firstVisibleChild) firstVisibleChild = child;
        lastVisibleChild = child;
      }
    }

    if (hiddenAbove === 0 && hiddenBelow === 0) continue;

    if (hiddenAbove > 0 && firstVisibleChild) {
      insertMarker(element, `${hiddenAbove} items hidden above`, firstVisibleChild);
    }
    if (hiddenBelow > 0 && lastVisibleChild) {
      insertMarker(
        element,
        `${hiddenBelow} items hidden below`,
        lastVisibleChild.nextSibling as Element | null,
      );
    }

    results.push({ totalChildren: children.length, hiddenAbove, hiddenBelow });
  }

  return results;
};

export const restoreViewportSnapshot = (): void => {
  for (const element of document.querySelectorAll(`[${HIDDEN_MARKER_ATTR}]`)) {
    const previous = element.getAttribute(PREV_ARIA_HIDDEN_ATTR);
    if (previous) {
      element.setAttribute("aria-hidden", previous);
      element.removeAttribute(PREV_ARIA_HIDDEN_ATTR);
    } else {
      element.removeAttribute("aria-hidden");
    }
    element.removeAttribute(HIDDEN_MARKER_ATTR);
  }
  for (const marker of document.querySelectorAll(`[${MARKER_ELEMENT_ATTR}]`)) {
    marker.remove();
  }
};
