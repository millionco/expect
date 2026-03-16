interface BrowserTesterRuntime {
  injectOverlayLabels: (
    containerId: string,
    items: Array<{ label: number; x: number; y: number }>,
  ) => void;
  removeOverlay: (containerId: string) => void;
  findCursorInteractiveElements: (
    rootSelector: string,
    maxTextLength: number,
    interactiveRoles: string[],
    interactiveTags: string[],
  ) => Array<{ selector: string; text: string; reason: string }>;
}

declare const __browserTesterRuntime: BrowserTesterRuntime;
