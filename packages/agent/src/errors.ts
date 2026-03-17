import { Cause, Schema } from "effect";

export class ClaudeQueryError extends Schema.ErrorClass<ClaudeQueryError>("ClaudeQueryError")({
  _tag: Schema.tag("ClaudeQueryError"),
  cause: Schema.Unknown,
}) {
  message = `Claude query failed: ${Cause.isCause(this.cause) ? Cause.pretty(this.cause) : String(this.cause)}`;
}

export class CodexRunError extends Schema.ErrorClass<CodexRunError>("CodexRunError")({
  _tag: Schema.tag("CodexRunError"),
  cause: Schema.Unknown,
}) {
  message = `Codex run failed: ${Cause.isCause(this.cause) ? Cause.pretty(this.cause) : String(this.cause)}`;
}

export class CursorSpawnError extends Schema.ErrorClass<CursorSpawnError>("CursorSpawnError")({
  _tag: Schema.tag("CursorSpawnError"),
  executable: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to spawn ${this.executable}: ${Cause.isCause(this.cause) ? Cause.pretty(this.cause) : String(this.cause)}`;
}
