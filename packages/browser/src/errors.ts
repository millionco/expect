import { Schema } from "effect";

export class BrowserLaunchError extends Schema.ErrorClass<BrowserLaunchError>("BrowserLaunchError")(
  {
    _tag: Schema.tag("BrowserLaunchError"),
    cause: Schema.String,
  },
) {
  message = `Failed to launch browser: ${this.cause}`;
}

export class SnapshotTimeoutError extends Schema.ErrorClass<SnapshotTimeoutError>(
  "SnapshotTimeoutError",
)({
  _tag: Schema.tag("SnapshotTimeoutError"),
  selector: Schema.String,
  timeoutMs: Schema.Number,
  cause: Schema.String,
}) {
  message = `Snapshot timed out after ${this.timeoutMs}ms on selector "${this.selector}": ${this.cause}`;
}

export class RefNotFoundError extends Schema.ErrorClass<RefNotFoundError>("RefNotFoundError")({
  _tag: Schema.tag("RefNotFoundError"),
  ref: Schema.String,
  availableRefs: Schema.Array(Schema.String),
}) {
  message =
    this.availableRefs.length === 0
      ? `Unknown ref "${this.ref}" (no refs available — page may be empty)`
      : `Unknown ref "${this.ref}" (available refs: ${this.availableRefs.join(", ")})`;
}

export class RefAmbiguousError extends Schema.ErrorClass<RefAmbiguousError>("RefAmbiguousError")({
  _tag: Schema.tag("RefAmbiguousError"),
  ref: Schema.String,
  matchCount: Schema.String,
}) {
  message = `Ref "${this.ref}" matched ${this.matchCount} elements. Run snapshot to get updated refs.`;
}

export class RefBlockedError extends Schema.ErrorClass<RefBlockedError>("RefBlockedError")({
  _tag: Schema.tag("RefBlockedError"),
  ref: Schema.String,
}) {
  message = `Ref "${this.ref}" is blocked by an overlay. Dismiss any modals or banners first.`;
}

export class RefNotVisibleError extends Schema.ErrorClass<RefNotVisibleError>("RefNotVisibleError")(
  {
    _tag: Schema.tag("RefNotVisibleError"),
    ref: Schema.String,
  },
) {
  message = `Ref "${this.ref}" is not visible. Try scrolling it into view.`;
}

export class ActionTimeoutError extends Schema.ErrorClass<ActionTimeoutError>("ActionTimeoutError")(
  {
    _tag: Schema.tag("ActionTimeoutError"),
    ref: Schema.String,
  },
) {
  message = `Action on "${this.ref}" timed out. The element may be blocked or still loading. Run snapshot to check.`;
}

export class ActionUnknownError extends Schema.ErrorClass<ActionUnknownError>("ActionUnknownError")(
  {
    _tag: Schema.tag("ActionUnknownError"),
    ref: Schema.String,
    cause: Schema.String,
  },
) {
  message = `Action on "${this.ref}" failed: ${this.cause}`;
}

export class NavigationError extends Schema.ErrorClass<NavigationError>("NavigationError")({
  _tag: Schema.tag("NavigationError"),
  url: Schema.String,
  cause: Schema.String,
}) {
  message = `Navigation to "${this.url}" failed: ${this.cause}`;
}

export class RecorderInjectionError extends Schema.ErrorClass<RecorderInjectionError>(
  "RecorderInjectionError",
)({
  _tag: Schema.tag("RecorderInjectionError"),
  cause: Schema.String,
}) {
  message = `Failed to inject rrweb recorder: ${this.cause}`;
}

export class SessionLoadError extends Schema.ErrorClass<SessionLoadError>("SessionLoadError")({
  _tag: Schema.tag("SessionLoadError"),
  path: Schema.String,
  cause: Schema.String,
}) {
  message = `Failed to load session from ${this.path}: ${this.cause}`;
}

export type ActionError =
  | RefAmbiguousError
  | RefBlockedError
  | RefNotVisibleError
  | ActionTimeoutError
  | ActionUnknownError;
