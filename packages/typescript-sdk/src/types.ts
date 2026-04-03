import type { Page, BrowserContext, Cookie } from "playwright";
import type { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";

export type { Cookie };

export type Action = string | ((page: Page) => Promise<void | string>);

export type BrowserName = "chrome" | "firefox" | "safari" | "edge" | "brave" | "arc";

export type CookieInput = true | BrowserName | BrowserName[] | Cookie[];

export type Test = string | { title?: string; prompt: string };

export type Status = "pending" | "passed" | "failed";

export interface Tool extends Pick<McpTool, "name" | "description" | "inputSchema"> {
  readonly handler: (input: Record<string, unknown>) => Promise<string>;
}

export interface StepResult {
  readonly title: string;
  readonly status: Status;
  readonly summary: string;
  readonly screenshotPath?: string;
  readonly duration: number;
}

export interface TestResult {
  readonly status: Status;
  readonly url: string;
  readonly duration: number;
  readonly recordingPath?: string;
  readonly steps: StepResult[];
  readonly errors: StepResult[];
}

export type TestEvent =
  | { readonly type: "run:started"; readonly title: string; readonly baseUrl?: string }
  | { readonly type: "step:started"; readonly title: string }
  | { readonly type: "step:passed"; readonly step: StepResult }
  | { readonly type: "step:failed"; readonly step: StepResult }
  | { readonly type: "step:skipped"; readonly title: string; readonly reason: string }
  | { readonly type: "screenshot"; readonly title: string; readonly path: string }
  | { readonly type: "completed"; readonly result: TestResult };

export interface TestRun extends PromiseLike<TestResult> {
  [Symbol.asyncIterator](): AsyncIterator<TestEvent>;
}

export interface TestInput {
  readonly url?: string;
  readonly page?: Page;
  readonly cookies?: CookieInput;
  readonly tools?: Tool[];
  readonly tests: Test[];
  readonly before?: Action;
  readonly after?: Action;
  readonly mode?: "headed" | "headless";
  readonly timeout?: number;
  readonly isRecording?: boolean;
}

export interface SessionConfig {
  readonly url?: string;
  readonly browserContext?: BrowserContext;
  readonly cookies?: CookieInput;
  readonly tools?: Tool[];
  readonly mode?: "headed" | "headless";
  readonly timeout?: number;
  readonly isRecording?: boolean;
}

export interface SessionTestInput {
  readonly url?: string;
  readonly tests: Test[];
  readonly before?: Action;
  readonly after?: Action;
  readonly mode?: "headed" | "headless";
  readonly timeout?: number;
  readonly isRecording?: boolean;
}

export interface ExpectSession {
  test(input: SessionTestInput): TestRun;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface ExpectConfig {
  readonly baseUrl?: string;
  readonly browser?: BrowserName;
  readonly mode?: "headed" | "headless";
  readonly cookies?: CookieInput;
  readonly timeout?: number;
  readonly model?: string;
  readonly apiKey?: string;
  readonly rootDir?: string;
}
