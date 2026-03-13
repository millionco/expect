export { createPage } from "./create-page";
export { injectCookies } from "./inject-cookies";
export { act } from "./act";
export { snapshot } from "./snapshot";
export { annotatedScreenshot } from "./annotated-screenshot";
export { diffSnapshots } from "./diff";
export { saveVideo } from "./save-video";
export { waitForNavigationSettle } from "./utils/wait-for-settle";
export {
  CookieJar,
  detectBrowserProfiles,
  detectDefaultBrowser,
  extractAllProfileCookies,
  extractCookies,
  extractProfileCookies,
  toCookieHeader,
} from "@browser-tester/cookies";
export type {
  Browser,
  BrowserInfo,
  BrowserProfile,
  Cookie,
  ExtractOptions,
  ExtractProfileOptions,
  ExtractResult,
} from "@browser-tester/cookies";
export type {
  AnnotatedScreenshotOptions,
  AnnotatedScreenshotResult,
  Annotation,
} from "./annotated-screenshot";
export type { SnapshotDiff } from "./diff";
export type {
  AriaRole,
  CreatePageOptions,
  CreatePageResult,
  RefEntry,
  RefMap,
  SnapshotOptions,
  SnapshotResult,
  SnapshotStats,
  VideoOptions,
} from "./types";
