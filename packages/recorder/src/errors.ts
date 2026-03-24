import { Schema } from "effect";

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
