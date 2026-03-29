import { Schema } from "effect";

export const McpEnvEntry = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
});

const ModelPreference = Schema.Struct({
  configId: Schema.String,
  value: Schema.String,
});

export class AgentStreamOptions extends Schema.Class<AgentStreamOptions>("AgentStreamOptions")({
  cwd: Schema.String,
  sessionId: Schema.Option(Schema.String),
  prompt: Schema.String,
  systemPrompt: Schema.Option(Schema.String),
  mcpEnv: Schema.optional(Schema.Array(McpEnvEntry)),
  modelPreference: Schema.optional(ModelPreference),
}) {}
