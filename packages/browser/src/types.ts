import type { Cookie } from "@browser-tester/cookies";
import type { Browser as PlaywrightBrowser, BrowserContext, Locator, Page } from "playwright";

export type AriaRole = Parameters<Page["getByRole"]>[0];

export interface SnapshotOptions {
  timeout?: number;
  interactive?: boolean;
  compact?: boolean;
  maxDepth?: number;
  selector?: string;
  cursor?: boolean;
}

export interface RefEntry {
  role: AriaRole;
  name: string;
  nth?: number;
  selector?: string;
}

export interface RefMap {
  [ref: string]: RefEntry;
}

export interface SnapshotStats {
  lines: number;
  characters: number;
  estimatedTokens: number;
  totalRefs: number;
  interactiveRefs: number;
}

export interface SnapshotResult {
  tree: string;
  refs: RefMap;
  stats: SnapshotStats;
  locator: (ref: string) => Locator;
}

export interface ParsedAriaLine {
  role: AriaRole;
  name: string;
}

export interface VideoOptions {
  dir: string;
  size?: { width: number; height: number };
}

export interface CreatePageOptions {
  headed?: boolean;
  executablePath?: string;
  cookies?: boolean | Cookie[];
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  video?: boolean | VideoOptions;
}

export interface CreatePageResult {
  browser: PlaywrightBrowser;
  context: BrowserContext;
  page: Page;
}
