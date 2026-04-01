export { Browser, runBrowser } from "./browser";
export { buildReplayViewerHtml } from "./replay-viewer";
export { diffSnapshots } from "./diff";
export { collectEvents, collectAllEvents, loadSession } from "./recorder";
export { autoDiscoverCdp, discoverCdpUrl } from "./cdp-discovery";
export { RrVideo, RrVideoConvertError } from "./rrvideo";
export type {
  Browser as BrowserProfile,
  BrowserKey,
  Cookie,
  ExtractOptions,
} from "@expect/cookies";
export {
  ActionTimeoutError,
  ActionUnknownError,
  BrowserLaunchError,
  CdpConnectionError,
  CdpDiscoveryError,
  NavigationError,
  RecorderInjectionError,
  RefAmbiguousError,
  RefBlockedError,
  RefNotFoundError,
  RefNotVisibleError,
  SessionLoadError,
  SnapshotTimeoutError,
} from "./errors";
export type { ActionError } from "./errors";
export type {
  Annotation,
  AnnotatedScreenshotOptions,
  AnnotatedScreenshotResult,
  AriaRole,
  BrowserEngine,
  CollectResult,
  CreatePageOptions,
  RefEntry,
  RefMap,
  SnapshotDiff,
  SnapshotOptions,
  SnapshotResult,
  SnapshotStats,
} from "./types";
