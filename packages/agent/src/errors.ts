import { Schema } from "effect";

export class ClaudeQueryError extends Schema.ErrorClass<ClaudeQueryError>("ClaudeQueryError")({
  _tag: Schema.tag("ClaudeQueryError"),
  cause: Schema.String,
}) {
  message = `Claude query failed: ${this.cause}`;
}

export class CodexRunError extends Schema.ErrorClass<CodexRunError>("CodexRunError")({
  _tag: Schema.tag("CodexRunError"),
  cause: Schema.String,
}) {
  message = `Codex run failed: ${this.cause}`;
}

export class CursorSpawnError extends Schema.ErrorClass<CursorSpawnError>("CursorSpawnError")({
  _tag: Schema.tag("CursorSpawnError"),
  executable: Schema.String,
  cause: Schema.String,
}) {
  message = `Failed to spawn ${this.executable}: ${this.cause}`;
}
