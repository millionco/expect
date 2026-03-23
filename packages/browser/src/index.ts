export { Browser, runBrowser } from "./browser";
export { diffSnapshots } from "./diff";
export { collectEvents, collectAllEvents } from "./recorder";
export type {
  Browser as BrowserProfile,
  BrowserKey,
  Cookie,
  ExtractOptions,
} from "@browser-tester/cookies";
export {
  ActionTimeoutError,
  ActionUnknownError,
  BrowserLaunchError,
  NavigationError,
  RecorderInjectionError,
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
  CollectResult,
  CreatePageOptions,
  RefEntry,
  RefMap,
  SnapshotDiff,
  SnapshotOptions,
  SnapshotResult,
  SnapshotStats,
} from "./types";
