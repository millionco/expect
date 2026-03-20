import type { eventWithTime } from "@rrweb/types";
import type { Effect } from "effect";
import type { Cookie } from "@browser-tester/cookies";
import type { Locator, Page } from "playwright";
import type { RefNotFoundError } from "./errors";

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
  role: string;
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
  locator: (ref: string) => Effect.Effect<Locator, RefNotFoundError>;
}

export interface CreatePageOptions {
  headed?: boolean;
  executablePath?: string;
  cookies?: boolean | Cookie[];
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

export interface AnnotatedScreenshotOptions extends SnapshotOptions {
  fullPage?: boolean;
}

export interface Annotation {
  label: number;
  ref: string;
  role: string;
  name: string;
}

export interface AnnotatedScreenshotResult {
  screenshot: Buffer;
  annotations: Annotation[];
}

export interface SnapshotDiff {
  diff: string;
  additions: number;
  removals: number;
  unchanged: number;
  changed: boolean;
}

export interface CollectResult {
  readonly events: ReadonlyArray<eventWithTime>;
  readonly total: number;
}
