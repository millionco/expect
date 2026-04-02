import type { BrowserEngine } from "@expect/browser";

/**
 * A Playwright `Page` object. Duck-typed to avoid a hard dependency on `playwright`.
 *
 * @example
 * ```ts
 * import { test } from "@playwright/test";
 * import { expect } from "expect";
 *
 * test("login flow", async ({ page }) => {
 *   await page.goto("http://localhost:3000/login");
 *   await expect(page).toPass(["redirected to the dashboard"]);
 * });
 * ```
 */
export interface PlaywrightPage {
  url(): string;
  goto(url: string, options?: unknown): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Target for `expect()`. Either a URL string or an object with `url` and optional `data`.
 *
 * @example
 * ```ts
 * // URL string
 * expect("http://localhost:3000/login")
 *
 * // Target object with data
 * expect({ url: "/login", data: { email: "test@example.com" } })
 * ```
 */
export interface ExpectTarget {
  readonly url: string;
  readonly data?: string | Record<string, unknown>;
}

/**
 * A requirement to verify. Either a plain string or an object with `requirement` and `data`.
 *
 * @example
 * ```ts
 * // Simple string requirement
 * "signing in with valid credentials redirects to the dashboard"
 *
 * // Requirement with data
 * { requirement: "signing in redirects to dashboard", data: { email: "test@example.com" } }
 * ```
 */
export type Requirement =
  | string
  | {
      readonly requirement: string;
      readonly data: string | Record<string, unknown>;
    };

/**
 * Options for `.toPass()` controlling browser and execution behavior.
 *
 * @example
 * ```ts
 * await expect("/login").toPass(["test login"], {
 *   cookies: "chrome",
 *   isHeaded: true,
 *   timeout: 120_000,
 * });
 * ```
 */
export interface ToPassOptions {
  /** Use real auth cookies from a local browser profile. */
  readonly cookies?: string;
  /** Show the browser window (for debugging). Default: false. */
  readonly isHeaded?: boolean;
  /** Override the default 5-minute timeout (in milliseconds). */
  readonly timeout?: number;
  /** Save an rrweb session recording. Default: false. */
  readonly isRecording?: boolean;
}

/**
 * Result of a single step within a `.toPass()` call.
 */
export interface StepResult {
  readonly requirement: string;
  readonly status: "passed" | "failed" | "skipped";
  readonly summary: string;
  readonly screenshotPath?: string;
  readonly duration: number;
}

/**
 * Structured result from `.toPass()`. Never throws — always resolves.
 *
 * @example
 * ```ts
 * const result = await expect("/login").toPass(["test login"]);
 * result.isPassed;       // boolean
 * result.steps[0].status // "passed" | "failed" | "skipped"
 * ```
 */
export interface ExpectResult {
  readonly isPassed: boolean;
  readonly url: string;
  readonly duration: number;
  readonly recordingPath?: string;
  readonly steps: readonly StepResult[];
}

/**
 * Cookie configuration for extracting auth state from a local browser.
 *
 * @example
 * ```ts
 * { source: "chrome", profile: "Profile 1" }
 * ```
 */
export interface CookieConfig {
  readonly source: string;
  readonly profile?: string;
}

/**
 * Configuration for the `expect` package.
 *
 * @example
 * ```ts
 * import { defineConfig } from "expect";
 *
 * export default defineConfig({
 *   baseUrl: "http://localhost:3000",
 *   browser: "chromium",
 *   cookies: "chrome",
 * });
 * ```
 */
export interface ExpectConfig {
  /** Base URL prepended to relative URLs. */
  readonly baseUrl?: string;
  /** Browser engine to use. Default: "chromium". */
  readonly browser?: BrowserEngine;
  /** Run the browser without a visible window. Default: true. */
  readonly isHeadless?: boolean;
  /** Extract auth cookies from a local browser profile. */
  readonly cookies?: string | CookieConfig;
  /** Execution timeout in milliseconds. Default: 300000 (5 minutes). */
  readonly timeout?: number;
  /** LLM model identifier override. */
  readonly model?: string;
  /** API key for the LLM provider. */
  readonly apiKey?: string;
  /** Shell command to start the dev server before tests. */
  readonly startCommand?: string;
}

/**
 * The chain returned by `expect()`, providing the `.toPass()` matcher.
 */
export interface ExpectChain {
  /**
   * Validate requirements against a live browser. Never throws.
   *
   * @param requirements - One or more natural-language requirements to verify.
   * @param options - Optional run-level configuration.
   * @returns Structured result with pass/fail status per requirement.
   *
   * @example
   * ```ts
   * const result = await expect("http://localhost:3000/login").toPass([
   *   "signing in with valid credentials redirects to the dashboard",
   *   "invalid credentials show an error message",
   * ]);
   * ```
   */
  toPass(
    requirements: Requirement | readonly Requirement[],
    options?: ToPassOptions,
  ): Promise<ExpectResult>;
}
