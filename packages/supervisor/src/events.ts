export interface BrowserRunBaseEvent {
  timestamp: number;
}

export interface BrowserRunStartedEvent extends BrowserRunBaseEvent {
  type: "run-started";
  title: string;
  liveViewUrl?: string;
}

export interface BrowserRunTextEvent extends BrowserRunBaseEvent {
  type: "text";
  text: string;
}

export interface BrowserRunThinkingEvent extends BrowserRunBaseEvent {
  type: "thinking";
  text: string;
}

export interface BrowserRunToolCallEvent extends BrowserRunBaseEvent {
  type: "tool-call";
  toolName: string;
  input: string;
}

export interface BrowserRunToolResultEvent extends BrowserRunBaseEvent {
  type: "tool-result";
  toolName: string;
  result: string;
  isError: boolean;
}

export interface BrowserRunBrowserLogEvent extends BrowserRunBaseEvent {
  type: "browser-log";
  action: string;
  message: string;
}

export interface BrowserRunStepStartedEvent extends BrowserRunBaseEvent {
  type: "step-started";
  stepId: string;
  title: string;
}

export interface BrowserRunStepCompletedEvent extends BrowserRunBaseEvent {
  type: "step-completed";
  stepId: string;
  summary: string;
}

export interface BrowserRunAssertionFailedEvent extends BrowserRunBaseEvent {
  type: "assertion-failed";
  stepId: string;
  message: string;
}

export interface BrowserRunCompletedEvent extends BrowserRunBaseEvent {
  type: "run-completed";
  status: "passed" | "failed";
  summary: string;
  sessionId?: string;
  replaySessionPath?: string;
  report?: import("./types.js").BrowserRunReport;
}

export interface BrowserRunErrorEvent extends BrowserRunBaseEvent {
  type: "error";
  message: string;
}

export type BrowserRunEvent =
  | BrowserRunStartedEvent
  | BrowserRunTextEvent
  | BrowserRunThinkingEvent
  | BrowserRunToolCallEvent
  | BrowserRunToolResultEvent
  | BrowserRunBrowserLogEvent
  | BrowserRunStepStartedEvent
  | BrowserRunStepCompletedEvent
  | BrowserRunAssertionFailedEvent
  | BrowserRunCompletedEvent
  | BrowserRunErrorEvent;
