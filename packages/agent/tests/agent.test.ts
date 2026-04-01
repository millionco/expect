import { describe, expect, it } from "vite-plus/test";
import { Effect, Option, Stream } from "effect";
import { Agent } from "../src/agent";
import { AgentStreamOptions } from "../src/types";
import { isCommandAvailable } from "@expect/shared/is-command-available";

const hasCodex = isCommandAvailable("codex");
const hasClaude = isCommandAvailable("claude");

const TEST_LAYERS = [
  ["codex-acp", Agent.layerCodex, hasCodex],
  ["claude-acp", Agent.layerClaude, hasClaude],
] as const;

const makeOptions = (prompt: string): AgentStreamOptions =>
  new AgentStreamOptions({
    cwd: process.cwd(),
    sessionId: Option.none(),
    prompt,
    systemPrompt: Option.none(),
  });

describe("Agent", () => {
  TEST_LAYERS.forEach(([name, layer, available]) => {
    describe.skipIf(!available)(name, () => {
      it("streams text response", async () => {
        const parts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(makeOptions("respond with just the word hello"))
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const textParts = parts.filter(
          (update) =>
            update.sessionUpdate === "agent_message_chunk" && update.content.type === "text",
        );
        const fullText = textParts
          .map((update) =>
            update.sessionUpdate === "agent_message_chunk" && update.content.type === "text"
              ? update.content.text
              : "",
          )
          .join("");
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

      it("resumes session with sessionId", async () => {
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

        const fullText = secondParts
          .filter(
            (update) =>
              update.sessionUpdate === "agent_message_chunk" && update.content.type === "text",
          )
          .map((update) =>
            update.sessionUpdate === "agent_message_chunk" && update.content.type === "text"
              ? update.content.text
              : "",
          )
          .join("")
          .toLowerCase();
        expect(fullText).toContain("ping");
      }, 60_000);

      it("discovers browser MCP tools", async () => {
        const parts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(makeOptions("what MCP tools do you have? list all tool names"))
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const fullText = parts
          .filter(
            (update) =>
              update.sessionUpdate === "agent_message_chunk" && update.content.type === "text",
          )
          .map((update) =>
            update.sessionUpdate === "agent_message_chunk" && update.content.type === "text"
              ? update.content.text
              : "",
          )
          .join("")
          .toLowerCase();

        const expectedTools = [
          "open",
          "playwright",
          "screenshot",
          "console_logs",
          "network_requests",
          "close",
        ];
        for (const tool of expectedTools) {
          expect(fullText).toContain(tool);
        }
      }, 60_000);
    });
  });
});
