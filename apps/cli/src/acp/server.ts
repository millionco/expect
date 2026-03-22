import * as crypto from "node:crypto";
import { Effect, Fiber, Layer, Option, Ref, Schema, ServiceMap, Stream } from "effect";
import { Executor, Git, Planner, Reporter } from "@browser-tester/supervisor";
import {
  PROTOCOL_VERSION,
  ERROR_CODE_INVALID_PARAMS,
  ERROR_CODE_METHOD_NOT_FOUND,
  StdioTransport,
  type ContentBlock,
  PromptRequest,
  SessionId,
  PlanEntry,
  type PlanEntryStatus,
  type SessionUpdate,
} from "@browser-tester/acp";
import {
  ChangesFor,
  DraftId,
  TestPlanDraft,
  type StepStatus,
  type TestPlan,
  type TestPlanStep,
} from "@browser-tester/shared/models";
import { type AgentBackend, layerFor as agentLayerFor } from "./agent.js";
import { AGENT_NAME, AGENT_TITLE, AGENT_VERSION, TOOL_CALL_ID_SHORT_LENGTH } from "./constants.js";

const IncomingMessage = Schema.Struct({
  jsonrpc: Schema.optional(Schema.String),
  id: Schema.optional(Schema.Union([Schema.String, Schema.Number])),
  method: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Unknown),
});

const NewSessionParams = Schema.Struct({
  cwd: Schema.optional(Schema.String),
  mcpServers: Schema.optional(Schema.Array(Schema.Unknown)),
});

const SetModeParams = Schema.Struct({
  sessionId: Schema.String,
  modeId: Schema.String,
});

const CancelParams = Schema.Struct({
  sessionId: Schema.String,
});

interface AcpSession {
  readonly sessionId: SessionId;
  readonly cwd: string;
  readonly currentMode: string;
  readonly runningFiber: Option.Option<Fiber.Fiber<unknown, unknown>>;
}

const stepStatusToAcpStatus = (status: StepStatus): PlanEntryStatus =>
  status === "active"
    ? "in_progress"
    : status === "passed" || status === "failed"
      ? "completed"
      : "pending";

const stepToAcpPlanEntry = (step: TestPlanStep): PlanEntry =>
  new PlanEntry({
    content: step.title,
    priority: "medium",
    status: stepStatusToAcpStatus(step.status),
  });

const planToAcpEntries = (plan: TestPlan): readonly PlanEntry[] =>
  plan.steps.map(stepToAcpPlanEntry);

const extractPromptText = (prompt: readonly ContentBlock[]): string =>
  prompt.reduce(
    (text, block) =>
      block.type === "text" ? text + (text.length > 0 ? "\n" : "") + block.text : text,
    "",
  );

export class AcpServer extends ServiceMap.Service<
  AcpServer,
  {
    readonly serve: Effect.Effect<void>;
  }
>()("@acp/AcpServer") {
  static layerFor = (agentBackend: AgentBackend) => {
    const agentLayer = agentLayerFor(agentBackend);

    return Layer.effect(AcpServer)(
      Effect.gen(function* () {
        const transport = yield* StdioTransport;
        const git = yield* Git;
        const planner = yield* Planner;
        const executor = yield* Executor;
        const reporter = yield* Reporter;
        const sessions = new Map<string, AcpSession>();

        const sendUpdate = Effect.fn("AcpServer.sendUpdate")(function* (
          sessionId: string,
          update: SessionUpdate,
        ) {
          yield* transport.sendNotification("session/update", { sessionId, update });
        });

        const runPrompt = Effect.fn("AcpServer.runPrompt")(function* (
          requestId: string | number,
          params: unknown,
        ) {
          const request = yield* Schema.decodeUnknownEffect(PromptRequest)(params).pipe(
            Effect.catchTag("SchemaError", (schemaError) =>
              Effect.gen(function* () {
                yield* transport.sendError(
                  requestId,
                  ERROR_CODE_INVALID_PARAMS,
                  `Invalid prompt: ${schemaError}`,
                );
                return yield* Effect.die(schemaError);
              }),
            ),
          );

          const session = sessions.get(request.sessionId);
          if (!session) {
            yield* transport.sendError(requestId, ERROR_CODE_INVALID_PARAMS, "Session not found");
            return;
          }

          const promptText = extractPromptText(request.prompt);
          const lastToolCallId = yield* Ref.make<string | undefined>(undefined);

          const runTurn = Effect.gen(function* () {
            yield* sendUpdate(request.sessionId, {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "Planning browser tests..." },
            });

            const currentBranch = yield* git.getCurrentBranch;
            const mainBranch = yield* git.getMainBranch;
            const changesFor = ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch });
            const fileStats = yield* git.getFileStats(changesFor);
            const diffPreview = yield* git.getDiffPreview(changesFor);

            const draft = new TestPlanDraft({
              id: DraftId.makeUnsafe(crypto.randomUUID()),
              changesFor,
              currentBranch,
              diffPreview,
              fileStats: [...fileStats],
              instruction: promptText,
              baseUrl: Option.none(),
              isHeadless: true,
              requiresCookies: false,
            });

            const testPlan = yield* planner.plan(draft);

            yield* sendUpdate(request.sessionId, {
              sessionUpdate: "session_info_update",
              title: testPlan.title,
            });

            yield* sendUpdate(request.sessionId, {
              sessionUpdate: "plan",
              entries: [...planToAcpEntries(testPlan)],
            });

            yield* sendUpdate(request.sessionId, {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: `\n\nTest plan: **${testPlan.title}**\n${testPlan.rationale}\n\n`,
              },
            });

            if (session.currentMode === "plan") {
              yield* sendUpdate(request.sessionId, {
                sessionUpdate: "agent_message_chunk",
                content: {
                  type: "text",
                  text: testPlan.steps
                    .map((step) => `- **${step.id}**: ${step.title}\n  ${step.instruction}`)
                    .join("\n"),
                },
              });
              return "end_turn" as const;
            }

            yield* sendUpdate(request.sessionId, {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "Executing test plan...\n\n" },
            });

            const finalExecuted = yield* executor.executePlan(testPlan).pipe(
              Stream.tap((executed) =>
                Effect.gen(function* () {
                  const lastEvent = executed.events.at(-1);
                  if (!lastEvent) return;

                  if (
                    lastEvent._tag === "StepStarted" ||
                    lastEvent._tag === "StepCompleted" ||
                    lastEvent._tag === "StepFailed"
                  ) {
                    yield* sendUpdate(request.sessionId, {
                      sessionUpdate: "plan",
                      entries: [...planToAcpEntries(executed)],
                    });
                  }

                  if (lastEvent._tag === "ToolCall") {
                    const toolCallId = `tc_${crypto.randomUUID().slice(0, TOOL_CALL_ID_SHORT_LENGTH)}`;
                    yield* Ref.set(lastToolCallId, toolCallId);
                    yield* sendUpdate(request.sessionId, {
                      sessionUpdate: "tool_call",
                      toolCallId,
                      title: lastEvent.displayText,
                      kind: "execute",
                      status: "in_progress",
                    });
                  }

                  if (lastEvent._tag === "ToolResult") {
                    const trackedId = yield* Ref.get(lastToolCallId);
                    const toolCallId =
                      trackedId ?? `tc_${crypto.randomUUID().slice(0, TOOL_CALL_ID_SHORT_LENGTH)}`;
                    yield* Ref.set(lastToolCallId, undefined);
                    yield* sendUpdate(request.sessionId, {
                      sessionUpdate: "tool_call_update",
                      toolCallId,
                      status: lastEvent.isError ? "error" : "completed",
                      content: [
                        {
                          type: "content" as const,
                          content: { type: "text" as const, text: lastEvent.result },
                        },
                      ],
                    });
                  }

                  if (lastEvent._tag === "AgentThinking" && lastEvent.text.length > 0) {
                    yield* sendUpdate(request.sessionId, {
                      sessionUpdate: "agent_thought_chunk",
                      content: { type: "text", text: lastEvent.text },
                    });
                  }

                  if (lastEvent._tag === "AgentText" && lastEvent.text.length > 0) {
                    yield* sendUpdate(request.sessionId, {
                      sessionUpdate: "agent_message_chunk",
                      content: { type: "text", text: lastEvent.text },
                    });
                  }
                }),
              ),
              Stream.runLast,
            );

            if (Option.isSome(finalExecuted)) {
              const report = yield* reporter.report(finalExecuted.value);
              yield* sendUpdate(request.sessionId, {
                sessionUpdate: "agent_message_chunk",
                content: {
                  type: "text",
                  text: `\n\n**Result: ${report.status.toUpperCase()}**\n${report.summary}`,
                },
              });
            }

            return "end_turn" as const;
          }).pipe(
            Effect.provide(agentLayer),
            Effect.provide(Git.withRepoRoot(session.cwd)),
            Effect.catchTag("FindRepoRootError", () => Effect.succeed("end_turn" as const)),
          );

          const turnWithErrorHandling = runTurn.pipe(
            Effect.catchTag("@supervisor/PlanningError", (planningError) =>
              Effect.gen(function* () {
                yield* sendUpdate(request.sessionId, {
                  sessionUpdate: "agent_message_chunk",
                  content: {
                    type: "text",
                    text: `\n\nPlanning failed: ${planningError.message}`,
                  },
                });
                return "end_turn" as const;
              }),
            ),
            Effect.catchTag("@supervisor/ExecutionError", (executionError) =>
              Effect.gen(function* () {
                yield* sendUpdate(request.sessionId, {
                  sessionUpdate: "agent_message_chunk",
                  content: {
                    type: "text",
                    text: `\n\nExecution failed: ${executionError.message}`,
                  },
                });
                return "end_turn" as const;
              }),
            ),
          );

          const fiber = yield* Effect.forkChild(turnWithErrorHandling);
          sessions.set(request.sessionId, { ...session, runningFiber: Option.some(fiber) });

          const stopReason = yield* Fiber.join(fiber);

          sessions.set(request.sessionId, { ...session, runningFiber: Option.none() });
          yield* transport.sendResponse(requestId, { stopReason });
        });

        const dispatch = Effect.fn("AcpServer.dispatch")(function* (rawLine: string) {
          const message = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(IncomingMessage))(
            rawLine,
          ).pipe(Effect.catchTag("SchemaError", () => Effect.succeed(undefined)));

          if (!message?.method) return;

          const { method, id, params } = message;

          if (id !== undefined) {
            if (method === "initialize") {
              yield* transport.sendResponse(id, {
                protocolVersion: PROTOCOL_VERSION,
                agentCapabilities: {
                  loadSession: false,
                  promptCapabilities: { embeddedContext: true },
                },
                agentInfo: { name: AGENT_NAME, title: AGENT_TITLE, version: AGENT_VERSION },
                authMethods: [],
              });
            } else if (method === "authenticate") {
              yield* transport.sendResponse(id, {});
            } else if (method === "session/new") {
              const parsed = yield* Schema.decodeUnknownEffect(NewSessionParams)(params ?? {}).pipe(
                Effect.catchTag("SchemaError", () => Effect.succeed({ cwd: undefined })),
              );
              const sessionId = `sess_${crypto.randomUUID().replace(/-/g, "")}`;
              const cwd = parsed.cwd ?? process.cwd();
              sessions.set(sessionId, {
                sessionId: SessionId.makeUnsafe(sessionId),
                cwd,
                currentMode: "test",
                runningFiber: Option.none(),
              });
              yield* transport.sendResponse(id, {
                sessionId,
                modes: {
                  currentModeId: "test",
                  availableModes: [
                    { id: "test", name: "Test", description: "Plan and execute browser tests" },
                    {
                      id: "plan",
                      name: "Plan Only",
                      description: "Generate a test plan without executing",
                    },
                  ],
                },
              });
            } else if (method === "session/prompt") {
              yield* runPrompt(id, params);
            } else if (method === "session/set_mode") {
              const parsed = yield* Schema.decodeUnknownEffect(SetModeParams)(params ?? {}).pipe(
                Effect.catchTag("SchemaError", () =>
                  Effect.succeed({ sessionId: "", modeId: "test" }),
                ),
              );
              const modeSession = sessions.get(parsed.sessionId);
              if (modeSession) {
                sessions.set(parsed.sessionId, { ...modeSession, currentMode: parsed.modeId });
                yield* sendUpdate(parsed.sessionId, {
                  sessionUpdate: "current_mode_update",
                  modeId: parsed.modeId,
                });
                yield* transport.sendResponse(id, {});
              } else {
                yield* transport.sendError(id, ERROR_CODE_INVALID_PARAMS, "Session not found");
              }
            } else {
              yield* transport.sendError(
                id,
                ERROR_CODE_METHOD_NOT_FOUND,
                `Unknown method: ${method}`,
              );
            }
          } else {
            if (method === "session/cancel") {
              const parsed = yield* Schema.decodeUnknownEffect(CancelParams)(params ?? {}).pipe(
                Effect.catchTag("SchemaError", () => Effect.succeed({ sessionId: "" })),
              );
              const cancelSession = sessions.get(parsed.sessionId);
              if (cancelSession && Option.isSome(cancelSession.runningFiber)) {
                yield* Effect.forkChild(Fiber.interrupt(cancelSession.runningFiber.value));
              }
            }
          }
        });

        const serve = Effect.gen(function* () {
          yield* Effect.forkChild(transport.startReading);
          yield* transport.incomingMessages.pipe(
            Stream.tap((line) => dispatch(line)),
            Stream.runDrain,
          );
        });

        return AcpServer.of({ serve });
      }),
    ).pipe(
      Layer.provide(StdioTransport.layer),
      Layer.provide(Planner.layer),
      Layer.provide(Executor.layer),
      Layer.provide(Reporter.layer),
      Layer.provide(Git.withRepoRoot(process.cwd())),
      Layer.provide(agentLayer),
    );
  };
}
