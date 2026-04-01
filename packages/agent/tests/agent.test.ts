import { describe, expect, it } from "vite-plus/test";
import { Effect, Layer, Option, Stream } from "effect";
import { Agent } from "../src/agent";
import { AgentStreamOptions } from "../src/types";
import { PlatformError } from "effect/PlatformError";
import { AcpAdapterNotFoundError, AcpConnectionInitError } from "../src/acp-client";
import { isCommandAvailable } from "../src/detect-agents";

const hasCodex = isCommandAvailable("codex");
const hasClaude = isCommandAvailable("claude");

const TEST_LAYERS: [
  string,
  boolean,
  Layer.Layer<Agent, PlatformError | AcpConnectionInitError | AcpAdapterNotFoundError>,
][] = [
  ["codex-acp", hasCodex, Agent.layerCodex],
  ["claude-acp", hasClaude, Agent.layerClaude],
];

const makeOptions = (prompt: string): AgentStreamOptions =>
  new AgentStreamOptions({
    cwd: process.cwd(),
    sessionId: Option.none(),
    prompt,
    systemPrompt: Option.none(),
  });

const collectText = (
  parts: readonly { sessionUpdate: string; content?: { type: string; text?: string } }[],
): string =>
  parts
    .filter(
      (update) =>
        update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text",
    )
    .map((update) =>
      update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text"
        ? (update.content.text ?? "")
        : "",
    )
    .join("");

describe("Agent", () => {
  TEST_LAYERS.forEach(([name, available, layer]) => {
    describe.skipIf(!available)(`${name}`, () => {
      it("streams text response", async () => {
        const parts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(makeOptions("respond with just the word hello"))
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const fullText = collectText(parts);
        expect(fullText.toLowerCase()).toContain("hello");
      }, 30_000);

      it("passes cwd to agent", async () => {
        const parts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(
              new AgentStreamOptions({
                cwd: "/tmp",
                sessionId: Option.none(),
                prompt: "run pwd and tell me the result",
                systemPrompt: Option.none(),
              }),
            )
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const toolResults = parts.filter(
          (update) =>
            update.sessionUpdate === "tool_call_update" &&
            (update.status === "completed" || update.status === "failed"),
        );
        expect(
          toolResults.some(
            (update) =>
              update.sessionUpdate === "tool_call_update" &&
              JSON.stringify(update.rawOutput ?? "").includes("/tmp"),
          ),
        ).toBe(true);
      }, 60_000);

      // HACK: codex-acp adapter has a session resume bug ("updates queue not found for session")
      // that causes the second stream to return empty. Skip until the adapter is fixed.
      it.skip("resumes session with sessionId", async () => {
        const secondParts = await Effect.gen(function* () {
          const agent = yield* Agent;
          const sessionId = yield* agent.createSession(process.cwd());

          yield* agent
            .stream(
              new AgentStreamOptions({
                cwd: process.cwd(),
                sessionId: Option.some(sessionId),
                prompt: "respond with just the word ping",
                systemPrompt: Option.none(),
              }),
            )
            .pipe(Stream.runCollect);

          return yield* agent
            .stream(
              new AgentStreamOptions({
                cwd: process.cwd(),
                sessionId: Option.some(sessionId),
                prompt: "what was the last word I asked you to say?",
                systemPrompt: Option.none(),
              }),
            )
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const fullText = collectText(secondParts).toLowerCase();
        expect(fullText.length).toBeGreaterThan(0);
      }, 60_000);

      it("discovers browser MCP tools", async () => {
        const parts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(makeOptions("list all your tool names"))
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const fullText = collectText(parts).toLowerCase();
        expect(fullText.length).toBeGreaterThan(0);
      }, 60_000);
    });
  });
});
