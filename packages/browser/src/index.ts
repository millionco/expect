export { Browser, runBrowser } from "./browser";
export { diffSnapshots } from "./diff";
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
  CreatePageOptions,
  RefEntry,
  RefMap,
  SnapshotDiff,
  SnapshotOptions,
  SnapshotResult,
  SnapshotStats,
} from "./types";
