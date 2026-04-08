export { Browser, runBrowser } from "./browser";
export { diffSnapshots } from "./diff";
export { autoDiscoverCdp, discoverCdpUrl } from "./cdp-discovery";
export type {
  Browser as BrowserProfile,
  BrowserKey,
  Cookie,
  ExtractOptions,
} from "@expect/cookies";
export {
  ActionTimeoutError,
  ActionUnknownError,
  BrowserAlreadyOpenError,
  BrowserLaunchError,
  BrowserNotOpenError,
  CdpConnectionError,
  CdpDiscoveryError,
  ChromeNotFoundError,
  ChromeSpawnError,
  ChromeLaunchTimeoutError,
  ChromeProfileNotFoundError,
  McpServerStartError,
  NavigationError,
  RefAmbiguousError,
  RefBlockedError,
  RefNotFoundError,
  RefNotVisibleError,
  SnapshotTimeoutError,
} from "./errors";
export type { ActionError } from "./errors";
export type {
  Annotation,
  AnnotatedScreenshotOptions,
  AnnotatedScreenshotResult,
  AriaRole,
  BrowserEngine,
  CreatePageOptions,
  RefEntry,
  RefMap,
  SnapshotDiff,
  SnapshotOptions,
  SnapshotResult,
  SnapshotStats,
} from "./types";
