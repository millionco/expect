import { Agent, AgentStreamOptions, ClaudeQueryError, CodexRunError } from "@browser-tester/agent";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, Layer, Option, Ref, Schema, ServiceMap, Stream } from "effect";

import {
  AgentThinking,
  ExecutedTestPlan,
  RunFinished,
  RunStarted,
  StepCompleted,
  StepFailed,
  StepId,
  StepStarted,
  ToolCall,
  ToolResult,
  type ExecutionEvent,
  type TestPlan,
} from "@browser-tester/shared/models";
import { serializeToolResult } from "./utils/serialize-tool-result.js";

export class ExecutionError extends Schema.ErrorClass<ExecutionError>("@supervisor/ExecutionError")(
  {
    _tag: Schema.tag("@supervisor/ExecutionError"),
    reason: Schema.Union([ClaudeQueryError, CodexRunError]),
  },
) {
  message = `Execution failed: ${this.reason.message}`;
}

const parseMarker = (line: string): ExecutionEvent | null => {
  const pipeIndex = line.indexOf("|");
  if (pipeIndex === -1) return null;

  const marker = line.slice(0, pipeIndex);
  const rest = line.slice(pipeIndex + 1);
  const secondPipeIndex = rest.indexOf("|");
  const first = secondPipeIndex === -1 ? rest : rest.slice(0, secondPipeIndex);
  const second = secondPipeIndex === -1 ? "" : rest.slice(secondPipeIndex + 1);

  if (marker === "STEP_START") {
    return new StepStarted({ stepId: Schema.decodeSync(StepId)(first), title: second });
  }
  if (marker === "STEP_DONE") {
    return new StepCompleted({ stepId: Schema.decodeSync(StepId)(first), summary: second });
  }
  if (marker === "ASSERTION_FAILED") {
    return new StepFailed({ stepId: Schema.decodeSync(StepId)(first), message: second });
  }
  if (marker === "RUN_COMPLETED") {
    const status = Schema.decodeSync(Schema.Literals(["passed", "failed"] as const))(
      first === "failed" ? "failed" : "passed",
    );
    return new RunFinished({ status, summary: second });
  }

  return null;
};

const streamPartToUpdate = (
  part: LanguageModelV3StreamPart,
  buffer: Ref.Ref<string>,
): Effect.Effect<readonly ExecutionEvent[]> =>
  Effect.gen(function* () {
    if (part.type === "text-delta") {
      const buffered = yield* Ref.get(buffer);
      const combined = buffered + part.delta;
      const lines = combined.split("\n");
      const remaining = lines.pop() ?? "";
      yield* Ref.set(buffer, remaining);

      const events: ExecutionEvent[] = [];
      for (const line of lines) {
        const event = parseMarker(line.trim());
        if (event) events.push(event);
      }
      return events;
    }

    if (part.type === "reasoning-delta") {
      return [new AgentThinking({ text: part.delta })];
    }

    if (part.type === "tool-call") {
      return [new ToolCall({ toolName: part.toolName, input: part.input })];
    }

    if (part.type === "tool-result") {
      return [
        new ToolResult({
          toolName: part.toolName,
          result: serializeToolResult(part.result),
          isError: Boolean(part.isError),
        }),
      ];
    }

    return [];
  });

export class Executor extends ServiceMap.Service<Executor>()("@supervisor/Executor", {
  make: Effect.gen(function* () {
    const agent = yield* Agent;

    const executePlan = Effect.fn("Executor.executePlan")(function* (plan: TestPlan) {
      const runStarted = new RunStarted({ plan });
      const buffer = yield* Ref.make("");
      const initial = new ExecutedTestPlan({ ...plan, events: [runStarted] });

      return agent
        .stream(
          new AgentStreamOptions({
            cwd: process.cwd(),
            sessionId: Option.none(),
            prompt: plan.prompt,
            systemPrompt: Option.none(),
          }),
        )
        .pipe(
          Stream.mapEffect((part) => streamPartToUpdate(part, buffer)),
          Stream.flatMap((events) => Stream.fromIterable(events)),
          Stream.mapAccum(
            () => initial,
            (executed, event) => {
              const next = executed.addEvent(event);
              return [next, [next]] as const;
            },
          ),
          Stream.mapError((reason) => new ExecutionError({ reason })),
        );
    });

    return { executePlan } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
