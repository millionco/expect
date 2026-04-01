import { Schema } from "effect";

export class McpSessionNotOpenError extends Schema.ErrorClass<McpSessionNotOpenError>(
  "McpSessionNotOpenError",
)({
  _tag: Schema.tag("McpSessionNotOpenError"),
}) {
  message = "No browser open. Call the 'open' tool first.";
}
