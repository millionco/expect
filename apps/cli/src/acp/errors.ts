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
