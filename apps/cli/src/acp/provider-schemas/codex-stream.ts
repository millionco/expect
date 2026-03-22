import { Option, Schema } from "effect";
import {
  AgentText,
  AgentThinking,
  ToolCall,
  ToolResult,
  type ExecutionEvent,
} from "@browser-tester/shared/models";

const CommandExecutionStatus = Schema.Literals(["in_progress", "completed", "failed"] as const);
const PatchApplyStatus = Schema.Literals(["completed", "failed"] as const);
const McpToolCallStatus = Schema.Literals(["in_progress", "completed", "failed"] as const);
const PatchChangeKind = Schema.Literals(["add", "delete", "update"] as const);

export class CodexCommandExecution extends Schema.Class<CodexCommandExecution>(
  "CodexCommandExecution",
)({
  id: Schema.String,
  type: Schema.Literal("command_execution"),
  command: Schema.String,
  aggregated_output: Schema.String,
  exit_code: Schema.optional(Schema.NullOr(Schema.Number)),
  status: CommandExecutionStatus,
}) {
  get isError() {
    return (
      this.status === "failed" ||
      (this.exit_code !== undefined && this.exit_code !== null && this.exit_code !== 0)
    );
  }

  get executionEvents(): ExecutionEvent[] {
    return [
      new ToolCall({ toolName: "exec", input: { command: this.command } }),
      new ToolResult({
        toolName: "exec",
        result: JSON.stringify({
          command: this.command,
          aggregatedOutput: this.aggregated_output,
          exitCode: this.exit_code,
          status: this.status,
        }),
        isError: this.isError,
      }),
    ];
  }
}

export class CodexFileChange extends Schema.Class<CodexFileChange>("CodexFileChange")({
  id: Schema.String,
  type: Schema.Literal("file_change"),
  changes: Schema.Array(Schema.Struct({ path: Schema.String, kind: PatchChangeKind })),
  status: PatchApplyStatus,
}) {
  get executionEvents(): ExecutionEvent[] {
    return [
      new ToolCall({ toolName: "patch", input: { changes: this.changes } }),
      new ToolResult({
        toolName: "patch",
        result: JSON.stringify({ changes: this.changes, status: this.status }),
        isError: this.status === "failed",
      }),
    ];
  }
}

export class CodexMcpToolCall extends Schema.Class<CodexMcpToolCall>("CodexMcpToolCall")({
  id: Schema.String,
  type: Schema.Literal("mcp_tool_call"),
  server: Schema.String,
  tool: Schema.String,
  arguments: Schema.Unknown,
  result: Schema.optional(
    Schema.Struct({ content: Schema.Array(Schema.Unknown), structured_content: Schema.Unknown }),
  ),
  error: Schema.optional(Schema.Struct({ message: Schema.String })),
  status: McpToolCallStatus,
}) {
  get toolName() {
    return `mcp__${this.server}__${this.tool}`;
  }

  get executionEvents(): ExecutionEvent[] {
    return [
      new ToolCall({
        toolName: this.toolName,
        input: { server: this.server, tool: this.tool, arguments: this.arguments },
      }),
      new ToolResult({
        toolName: this.toolName,
        result: JSON.stringify({
          server: this.server,
          tool: this.tool,
          status: this.status,
          ...(this.result ? { result: this.result } : {}),
          ...(this.error ? { error: this.error } : {}),
        }),
        isError: this.status === "failed",
      }),
    ];
  }
}

export class CodexAgentMessage extends Schema.Class<CodexAgentMessage>("CodexAgentMessage")({
  id: Schema.String,
  type: Schema.Literal("agent_message"),
  text: Schema.String,
}) {
  get executionEvents(): ExecutionEvent[] {
    return [new AgentText({ text: this.text })];
  }
}

export class CodexReasoning extends Schema.Class<CodexReasoning>("CodexReasoning")({
  id: Schema.String,
  type: Schema.Literal("reasoning"),
  text: Schema.String,
}) {
  get executionEvents(): ExecutionEvent[] {
    return [new AgentThinking({ text: this.text })];
  }
}

export class CodexWebSearch extends Schema.Class<CodexWebSearch>("CodexWebSearch")({
  id: Schema.String,
  type: Schema.Literal("web_search"),
  query: Schema.String,
}) {
  get executionEvents(): ExecutionEvent[] {
    return [
      new ToolCall({ toolName: "web_search", input: { query: this.query } }),
      new ToolResult({
        toolName: "web_search",
        result: JSON.stringify({ query: this.query }),
        isError: false,
      }),
    ];
  }
}

export class CodexErrorItem extends Schema.Class<CodexErrorItem>("CodexErrorItem")({
  id: Schema.String,
  type: Schema.Literal("error"),
  message: Schema.String,
}) {
  get executionEvents(): ExecutionEvent[] {
    return [];
  }
}

export class CodexTodoList extends Schema.Class<CodexTodoList>("CodexTodoList")({
  id: Schema.String,
  type: Schema.Literal("todo_list"),
  items: Schema.Array(Schema.Struct({ text: Schema.String, completed: Schema.Boolean })),
}) {
  get executionEvents(): ExecutionEvent[] {
    return [];
  }
}

export const CodexThreadItem = Schema.Union([
  CodexCommandExecution,
  CodexFileChange,
  CodexMcpToolCall,
  CodexAgentMessage,
  CodexReasoning,
  CodexWebSearch,
  CodexErrorItem,
  CodexTodoList,
]);
export type CodexThreadItem = typeof CodexThreadItem.Type;

export class CodexThreadStartedEvent extends Schema.Class<CodexThreadStartedEvent>(
  "CodexThreadStartedEvent",
)({
  type: Schema.Literal("thread.started"),
  thread_id: Schema.String,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export class CodexTurnStartedEvent extends Schema.Class<CodexTurnStartedEvent>(
  "CodexTurnStartedEvent",
)({
  type: Schema.Literal("turn.started"),
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export class CodexUsage extends Schema.Class<CodexUsage>("CodexUsage")({
  input_tokens: Schema.Number,
  cached_input_tokens: Schema.Number,
  output_tokens: Schema.Number,
}) {}

export class CodexTurnCompletedEvent extends Schema.Class<CodexTurnCompletedEvent>(
  "CodexTurnCompletedEvent",
)({
  type: Schema.Literal("turn.completed"),
  usage: CodexUsage,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export class CodexTurnFailedEvent extends Schema.Class<CodexTurnFailedEvent>(
  "CodexTurnFailedEvent",
)({
  type: Schema.Literal("turn.failed"),
  error: Schema.Struct({ message: Schema.String }),
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export class CodexItemStartedEvent extends Schema.Class<CodexItemStartedEvent>(
  "CodexItemStartedEvent",
)({
  type: Schema.Literal("item.started"),
  item: CodexThreadItem,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export class CodexItemUpdatedEvent extends Schema.Class<CodexItemUpdatedEvent>(
  "CodexItemUpdatedEvent",
)({
  type: Schema.Literal("item.updated"),
  item: CodexThreadItem,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export class CodexItemCompletedEvent extends Schema.Class<CodexItemCompletedEvent>(
  "CodexItemCompletedEvent",
)({
  type: Schema.Literal("item.completed"),
  item: CodexThreadItem,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    const events = this.item.executionEvents;
    return events.length > 0 ? Option.some(events) : Option.none();
  }
}

export class CodexThreadErrorEvent extends Schema.Class<CodexThreadErrorEvent>(
  "CodexThreadErrorEvent",
)({
  type: Schema.Literal("error"),
  message: Schema.String,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export const CodexThreadEvent = Schema.Union([
  CodexThreadStartedEvent,
  CodexTurnStartedEvent,
  CodexTurnCompletedEvent,
  CodexTurnFailedEvent,
  CodexItemStartedEvent,
  CodexItemUpdatedEvent,
  CodexItemCompletedEvent,
  CodexThreadErrorEvent,
]);
export type CodexThreadEvent = typeof CodexThreadEvent.Type;
