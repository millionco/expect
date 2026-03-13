import type { Browser } from "@browser-tester/cookies";
import type { Browser as PlaywrightBrowser, BrowserContext, Locator, Page } from "playwright";

export type AriaRole = Parameters<Page["getByRole"]>[0];

export interface SnapshotOptions {
  timeout?: number;
  interactive?: boolean;
  compact?: boolean;
  maxDepth?: number;
}

export interface RefEntry {
  role: AriaRole;
  name: string;
  nth?: number;
}

export interface RefMap {
  [ref: string]: RefEntry;
}

export interface SnapshotResult {
  tree: string;
  refs: RefMap;
  locator: (ref: string) => Locator;
}

export interface ParsedAriaLine {
  role: AriaRole;
  name: string;
}

export interface InjectCookiesOptions {
  url: string;
  browsers?: Browser[];
  names?: string[];
}

export interface CreatePageOptions {
  headed?: boolean;
  executablePath?: string;
  cookies?: boolean;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

export interface CreatePageResult {
  browser: PlaywrightBrowser;
  context: BrowserContext;
  page: Page;
}
