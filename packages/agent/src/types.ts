import { Schema } from "effect";

export class McpServerConfig extends Schema.Class<McpServerConfig>("McpServerConfig")({
  command: Schema.String,
  args: Schema.Array(Schema.String),
  env: Schema.Record(Schema.String, Schema.String),
}) {}

export class AgentStreamOptions extends Schema.Class<AgentStreamOptions>("AgentStreamOptions")({
  cwd: Schema.String,
  model: Schema.String,
  sessionId: Schema.String,
  prompt: Schema.String,
  systemPrompt: Schema.String,
}) {}
