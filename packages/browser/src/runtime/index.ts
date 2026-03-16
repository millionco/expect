interface OverlayItem {
  label: number;
  x: number;
  y: number;
}

interface CursorInteractiveResult {
  selector: string;
  text: string;
  reason: string;
}

export const injectOverlayLabels = (containerId: string, items: OverlayItem[]): void => {
  const container = document.createElement("div");
  container.id = containerId;
  container.style.position = "absolute";
  container.style.top = "0";
  container.style.left = "0";
  container.style.zIndex = "2147483647";
  container.style.pointerEvents = "none";

  for (const item of items) {
    const badge = document.createElement("div");
    badge.textContent = `[${item.label}]`;
    badge.style.position = "absolute";
    badge.style.left = `${item.x}px`;
    badge.style.top = `${item.y}px`;
    badge.style.background = "rgba(255, 0, 0, 0.85)";
    badge.style.color = "white";
    badge.style.fontSize = "11px";
    badge.style.fontFamily = "monospace";
    badge.style.fontWeight = "bold";
    badge.style.padding = "1px 3px";
    badge.style.borderRadius = "3px";
    badge.style.lineHeight = "1.2";
    badge.style.whiteSpace = "nowrap";
    container.appendChild(badge);
  }

  document.body.appendChild(container);
};

export const removeOverlay = (containerId: string): void => {
  document.getElementById(containerId)?.remove();
};

export const findCursorInteractiveElements = (
  rootSelector: string,
  maxTextLength: number,
  interactiveRoles: string[],
  interactiveTags: string[],
): CursorInteractiveResult[] => {
  const interactiveRoleSet = new Set(interactiveRoles);
  const interactiveTagSet = new Set(interactiveTags);
  const root = document.querySelector(rootSelector) || document.body;
  const elements = root.querySelectorAll("*");
  const results: CursorInteractiveResult[] = [];

  const buildUniqueSelector = (element: Element): string => {
    const testId = element.getAttribute("data-testid");
    if (testId) return `[data-testid="${testId}"]`;
    if (element.id) return `#${CSS.escape(element.id)}`;

    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selectorSegment = current.tagName.toLowerCase();
      const firstClass = current.classList[0];
      if (firstClass) selectorSegment += `.${CSS.escape(firstClass)}`;

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((sibling) => {
          if (sibling.tagName !== current!.tagName) return false;
          return !firstClass || sibling.classList.contains(firstClass);
        });
        if (siblings.length > 1) {
          selectorSegment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }

      parts.unshift(selectorSegment);
      current = current.parentElement;

      if (parts.length >= 1) {
        try {
          const candidate = parts.join(" > ");
          if (document.querySelectorAll(candidate).length === 1) break;
        } catch {
          // HACK: selector may be invalid mid-construction, keep building
        }
      }
      if (parts.length >= 10) break;
    }

    return parts.join(" > ");
  };

  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (interactiveTagSet.has(tagName)) continue;

    const role = element.getAttribute("role");
    if (role && interactiveRoleSet.has(role.toLowerCase())) continue;

    const computedStyle = getComputedStyle(element);
    const hasCursorPointer = computedStyle.cursor === "pointer";
    const hasOnClick = element.hasAttribute("onclick") || (element as HTMLElement).onclick !== null;
    const tabIndexAttr = element.getAttribute("tabindex");
    const hasTabIndex = tabIndexAttr !== null && tabIndexAttr !== "-1";

    if (!hasCursorPointer && !hasOnClick && !hasTabIndex) continue;

    if (hasCursorPointer && !hasOnClick && !hasTabIndex) {
      const parent = element.parentElement;
      if (parent && getComputedStyle(parent).cursor === "pointer") continue;
    }

    const text = (element.textContent || "").trim().slice(0, maxTextLength);
    if (!text) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const reasons: string[] = [];
    if (hasCursorPointer) reasons.push("cursor:pointer");
    if (hasOnClick) reasons.push("onclick");
    if (hasTabIndex) reasons.push("tabindex");

    results.push({
      selector: buildUniqueSelector(element),
      text,
      reason: reasons.join(", "),
    });
  }

  return results;
};
