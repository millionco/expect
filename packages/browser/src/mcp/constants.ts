import * as path from "node:path";

export const EXPECT_COOKIE_BROWSERS_ENV_NAME = "EXPECT_COOKIE_BROWSERS";
export const EXPECT_COOKIES_ENV_NAME = "EXPECT_COOKIES";
export const EXPECT_CDP_URL_ENV_NAME = "EXPECT_CDP_URL";
export const EXPECT_BASE_URL_ENV_NAME = "EXPECT_BASE_URL";
export const EXPECT_HEADED_ENV_NAME = "EXPECT_HEADED";
export const EXPECT_PROFILE_ENV_NAME = "EXPECT_PROFILE";
export const EXPECT_BROWSER_ENV_NAME = "EXPECT_BROWSER";
export const DUPLICATE_REQUEST_WINDOW_MS = 500;
export const TMP_ARTIFACT_OUTPUT_DIRECTORY = "/tmp/expect-artifacts";
export const CLI_SESSION_FILE = "/tmp/expect-cli-session.json";
export const MAX_DAEMON_REQUEST_BODY_BYTES = 1024 * 1024;
export const MAX_STRINGIFY_LENGTH = 10_000;
export const PLAYWRIGHT_RESULTS_DIR = path.join(
  TMP_ARTIFACT_OUTPUT_DIRECTORY,
  "playwright-results",
);
