import { Schema } from "effect";

export class SessionLoadError extends Schema.ErrorClass<SessionLoadError>("SessionLoadError")({
  _tag: Schema.tag("SessionLoadError"),
  path: Schema.String,
  cause: Schema.String,
}) {
  message = `Failed to load session from ${this.path}: ${this.cause}`;
}
