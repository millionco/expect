import { Schema } from "effect";

export const SessionId = Schema.String.pipe(Schema.brand("AcpSessionId"));
export type SessionId = typeof SessionId.Type;

export const ToolCallId = Schema.String.pipe(Schema.brand("AcpToolCallId"));
export type ToolCallId = typeof ToolCallId.Type;

export const StopReason = Schema.Union([
  Schema.Literal("end_turn"),
  Schema.Literal("max_tokens"),
  Schema.Literal("max_model_requests"),
  Schema.Literal("refused"),
  Schema.Literal("cancelled"),
]);
export type StopReason = typeof StopReason.Type;

export const ToolCallStatus = Schema.Union([
  Schema.Literal("pending"),
  Schema.Literal("in_progress"),
  Schema.Literal("completed"),
  Schema.Literal("failed"),
]);
export type ToolCallStatus = typeof ToolCallStatus.Type;

export const ToolCallKind = Schema.Union([
  Schema.Literal("other"),
  Schema.Literal("read"),
  Schema.Literal("edit"),
  Schema.Literal("delete"),
  Schema.Literal("move"),
  Schema.Literal("search"),
  Schema.Literal("execute"),
  Schema.Literal("think"),
  Schema.Literal("fetch"),
]);
export type ToolCallKind = typeof ToolCallKind.Type;

export const TextContent = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
});

export const ImageContent = Schema.Struct({
  type: Schema.Literal("image"),
  data: Schema.String,
  mimeType: Schema.String,
});

export const AudioContent = Schema.Struct({
  type: Schema.Literal("audio"),
  data: Schema.String,
  mimeType: Schema.String,
});

export const TextResource = Schema.Struct({
  uri: Schema.String,
  text: Schema.String,
  mimeType: Schema.optional(Schema.String),
});

export const BlobResource = Schema.Struct({
  uri: Schema.String,
  blob: Schema.String,
  mimeType: Schema.optional(Schema.String),
});

export const ResourceContent = Schema.Struct({
  type: Schema.Literal("resource"),
  resource: Schema.Union([TextResource, BlobResource]),
});

export const ResourceLinkContent = Schema.Struct({
  type: Schema.Literal("resource_link"),
  uri: Schema.String,
  name: Schema.String,
  mimeType: Schema.optional(Schema.String),
  size: Schema.optional(Schema.Number),
});

export const ContentBlock = Schema.Union([
  TextContent,
  ImageContent,
  AudioContent,
  ResourceContent,
  ResourceLinkContent,
]);
export type ContentBlock = typeof ContentBlock.Type;

export const ImplementationInfo = Schema.Struct({
  name: Schema.String,
  title: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
});
export type ImplementationInfo = typeof ImplementationInfo.Type;

export const FileSystemCapabilities = Schema.Struct({
  readTextFile: Schema.optional(Schema.Boolean),
  writeTextFile: Schema.optional(Schema.Boolean),
});

export const ClientCapabilities = Schema.Struct({
  fs: Schema.optional(FileSystemCapabilities),
  terminal: Schema.optional(Schema.Boolean),
});
export type ClientCapabilities = typeof ClientCapabilities.Type;

export const PromptCapabilities = Schema.Struct({
  image: Schema.optional(Schema.Boolean),
  audio: Schema.optional(Schema.Boolean),
  embeddedContext: Schema.optional(Schema.Boolean),
});

export const McpProtocolCapabilities = Schema.Struct({
  http: Schema.optional(Schema.Boolean),
  sse: Schema.optional(Schema.Boolean),
});

export const SessionCapabilities = Schema.Struct({
  list: Schema.optional(Schema.Boolean),
});

export const AgentCapabilities = Schema.Struct({
  loadSession: Schema.optional(Schema.Boolean),
  promptCapabilities: Schema.optional(PromptCapabilities),
  mcpCapabilities: Schema.optional(McpProtocolCapabilities),
  sessionCapabilities: Schema.optional(SessionCapabilities),
});
export type AgentCapabilities = typeof AgentCapabilities.Type;

export const AuthMethod = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
});

export const EnvVariable = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
});

export const HttpHeader = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
});

export const StdioMcpServer = Schema.Struct({
  name: Schema.String,
  command: Schema.String,
  args: Schema.optional(Schema.Array(Schema.String)),
  env: Schema.optional(Schema.Array(EnvVariable)),
});

export const HttpMcpServer = Schema.Struct({
  type: Schema.Literal("http"),
  name: Schema.String,
  url: Schema.String,
  headers: Schema.optional(Schema.Array(HttpHeader)),
});

export const SseMcpServer = Schema.Struct({
  type: Schema.Literal("sse"),
  name: Schema.String,
  url: Schema.String,
  headers: Schema.optional(Schema.Array(HttpHeader)),
});

export const AcpMcpServer = Schema.Union([HttpMcpServer, SseMcpServer, StdioMcpServer]);
export type AcpMcpServer = typeof AcpMcpServer.Type;

export const SessionMode = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
});

export const SessionModeState = Schema.Struct({
  currentModeId: Schema.String,
  availableModes: Schema.Array(SessionMode),
});
export type SessionModeState = typeof SessionModeState.Type;

export const InitializeRequest = Schema.Struct({
  protocolVersion: Schema.Number,
  clientCapabilities: Schema.optional(ClientCapabilities),
  clientInfo: Schema.optional(ImplementationInfo),
});
export type InitializeRequest = typeof InitializeRequest.Type;

export const InitializeResponse = Schema.Struct({
  protocolVersion: Schema.Number,
  agentCapabilities: Schema.optional(AgentCapabilities),
  agentInfo: Schema.optional(ImplementationInfo),
  authMethods: Schema.optional(Schema.Array(AuthMethod)),
});
export type InitializeResponse = typeof InitializeResponse.Type;

export const NewSessionRequest = Schema.Struct({
  cwd: Schema.optional(Schema.String),
  mcpServers: Schema.optional(Schema.Array(AcpMcpServer)),
});
export type NewSessionRequest = typeof NewSessionRequest.Type;

export const NewSessionResponse = Schema.Struct({
  sessionId: SessionId,
  modes: Schema.optional(SessionModeState),
});
export type NewSessionResponse = typeof NewSessionResponse.Type;

export const LoadSessionRequest = Schema.Struct({
  sessionId: SessionId,
  cwd: Schema.optional(Schema.String),
  mcpServers: Schema.optional(Schema.Array(AcpMcpServer)),
});
export type LoadSessionRequest = typeof LoadSessionRequest.Type;

export const PromptRequest = Schema.Struct({
  sessionId: SessionId,
  prompt: Schema.Array(ContentBlock),
});
export type PromptRequest = typeof PromptRequest.Type;

export const PromptResponse = Schema.Struct({
  stopReason: StopReason,
});
export type PromptResponse = typeof PromptResponse.Type;

export const CancelNotification = Schema.Struct({
  sessionId: SessionId,
});
export type CancelNotification = typeof CancelNotification.Type;

export const ToolCallContentText = Schema.Struct({
  type: Schema.Literal("content"),
  content: TextContent,
});

export const ToolCallContentDiff = Schema.Struct({
  type: Schema.Literal("diff"),
  path: Schema.String,
  // HACK: ACP wire protocol defines oldText as nullable (null = new file)
  oldText: Schema.NullOr(Schema.String),
  newText: Schema.String,
});

export const ToolCallContentTerminal = Schema.Struct({
  type: Schema.Literal("terminal"),
  terminalId: Schema.String,
});

export const ToolCallContent = Schema.Union([
  ToolCallContentText,
  ToolCallContentDiff,
  ToolCallContentTerminal,
]);
export type ToolCallContent = typeof ToolCallContent.Type;

export const FileLocation = Schema.Struct({
  path: Schema.String,
  line: Schema.optional(Schema.Number),
});

export const AgentMessageChunkUpdate = Schema.Struct({
  sessionUpdate: Schema.Literal("agent_message_chunk"),
  content: ContentBlock,
});

export const UserMessageChunkUpdate = Schema.Struct({
  sessionUpdate: Schema.Literal("user_message_chunk"),
  content: ContentBlock,
});

export const ThoughtMessageChunkUpdate = Schema.Struct({
  sessionUpdate: Schema.Literal("thought_message_chunk"),
  content: TextContent,
});

export const PlanEntry = Schema.Struct({
  content: Schema.String,
  priority: Schema.optional(
    Schema.Union([Schema.Literal("high"), Schema.Literal("medium"), Schema.Literal("low")]),
  ),
  status: Schema.optional(
    Schema.Union([
      Schema.Literal("pending"),
      Schema.Literal("in_progress"),
      Schema.Literal("completed"),
    ]),
  ),
});

export const PlanUpdate = Schema.Struct({
  sessionUpdate: Schema.Literal("plan"),
  entries: Schema.Array(PlanEntry),
});

export const ToolCallUpdate = Schema.Struct({
  sessionUpdate: Schema.Literal("tool_call"),
  toolCallId: ToolCallId,
  title: Schema.optional(Schema.String),
  kind: Schema.optional(ToolCallKind),
  status: Schema.optional(ToolCallStatus),
  content: Schema.optional(Schema.Array(ToolCallContent)),
  locations: Schema.optional(Schema.Array(FileLocation)),
  rawInput: Schema.optional(Schema.Unknown),
  rawOutput: Schema.optional(Schema.Unknown),
});

export const ToolCallStatusUpdate = Schema.Struct({
  sessionUpdate: Schema.Literal("tool_call_update"),
  toolCallId: ToolCallId,
  title: Schema.optional(Schema.String),
  status: Schema.optional(ToolCallStatus),
  content: Schema.optional(Schema.Array(ToolCallContent)),
  locations: Schema.optional(Schema.Array(FileLocation)),
  rawInput: Schema.optional(Schema.Unknown),
  rawOutput: Schema.optional(Schema.Unknown),
});

export const CurrentModeUpdate = Schema.Struct({
  sessionUpdate: Schema.Literal("current_mode_update"),
  modeId: Schema.String,
});

export const SessionUpdate = Schema.Union([
  AgentMessageChunkUpdate,
  UserMessageChunkUpdate,
  ThoughtMessageChunkUpdate,
  PlanUpdate,
  ToolCallUpdate,
  ToolCallStatusUpdate,
  CurrentModeUpdate,
]);
export type SessionUpdate = typeof SessionUpdate.Type;

export const SessionUpdateNotification = Schema.Struct({
  sessionId: SessionId,
  update: SessionUpdate,
});
export type SessionUpdateNotification = typeof SessionUpdateNotification.Type;

export const PermissionOptionKind = Schema.Union([
  Schema.Literal("reject_always"),
  Schema.Literal("reject_once"),
  Schema.Literal("allow_always"),
  Schema.Literal("allow_once"),
]);

export const PermissionOption = Schema.Struct({
  optionId: Schema.String,
  name: Schema.String,
  kind: PermissionOptionKind,
});

export const RequestPermissionParams = Schema.Struct({
  sessionId: SessionId,
  toolCall: Schema.Struct({
    toolCallId: Schema.optional(ToolCallId),
    title: Schema.optional(Schema.String),
    kind: Schema.optional(ToolCallKind),
    status: Schema.optional(ToolCallStatus),
    content: Schema.optional(Schema.Array(ToolCallContent)),
  }),
  options: Schema.Array(PermissionOption),
});
export type RequestPermissionParams = typeof RequestPermissionParams.Type;

export const PermissionOutcome = Schema.Union([
  Schema.Struct({ outcome: Schema.Literal("selected"), optionId: Schema.String }),
  Schema.Struct({ outcome: Schema.Literal("cancelled") }),
]);
export type PermissionOutcome = typeof PermissionOutcome.Type;

export const RequestPermissionResponse = Schema.Struct({
  outcome: PermissionOutcome,
});
export type RequestPermissionResponse = typeof RequestPermissionResponse.Type;
