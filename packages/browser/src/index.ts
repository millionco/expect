export { Playwright, type OpenOptions } from "./playwright";
export { Artifacts } from "./artifacts";
export { layerArtifactsRpc } from "./artifacts-rpc";
export { layerMcpServer } from "./mcp-server";
export { diffSnapshots } from "./diff";
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
  BrowserAlreadyOpenError,
  BrowserLaunchError,
  CdpConnectionError,
  CdpDiscoveryError,
  BrowserNotOpenError,
  McpServerStartError,
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
  CollectResult,
  RefEntry,
  RefMap,
  SnapshotDiff,
  SnapshotOptions,
  SnapshotResult,
  SnapshotStats,
} from "./types";
