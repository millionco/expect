import { Schema } from "effect";

export class McpSessionNotOpenError extends Schema.ErrorClass<McpSessionNotOpenError>(
  "McpSessionNotOpenError",
)({
  _tag: Schema.tag("McpSessionNotOpenError"),
}) {
  message = "No browser open. Call the 'open' tool first.";
}

export class McpVideoSaveError extends Schema.ErrorClass<McpVideoSaveError>("McpVideoSaveError")({
  _tag: Schema.tag("McpVideoSaveError"),
  cause: Schema.String,
}) {
  message = `Failed to save video: ${this.cause}`;
}
