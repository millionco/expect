import { describe, expect, it } from "vite-plus/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, Layer, Option, Stream } from "effect";
import { Agent } from "../src/agent.js";
import { AgentStreamOptions } from "../src/types.js";
import { PlatformError } from "effect/PlatformError";
import { AcpAdapterNotFoundError, AcpConnectionInitError } from "../src/acp-client.js";

const TEST_LAYERS: [
  string,
  Layer.Layer<Agent, PlatformError | AcpConnectionInitError | AcpAdapterNotFoundError>,
][] = [
  ["codex-acp", Agent.layerCodex],
  ["claude-acp", Agent.layerClaude],
];

const makeOptions = (prompt: string): AgentStreamOptions =>
  new AgentStreamOptions({
    cwd: process.cwd(),
    sessionId: Option.none(),
    prompt,
    systemPrompt: Option.none(),
  });

describe("Agent", () => {
  TEST_LAYERS.forEach(([name, layer]) => {
    describe(name, () => {
      it("streams text response", async () => {
        const parts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(makeOptions("respond with just the word hello"))
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const textParts = parts.filter(
          (part): part is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
            part.type === "text-delta",
        );
        const fullText = textParts.map((part) => part.delta).join("");
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
          (part): part is Extract<LanguageModelV3StreamPart, { type: "tool-result" }> =>
            part.type === "tool-result",
        );
        expect(toolResults.some((part) => part.result.includes("/tmp"))).toBe(true);
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

        const textParts = secondParts.filter(
          (part): part is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
            part.type === "text-delta",
        );
        expect(
          textParts
            .map((part) => part.delta)
            .join("")
            .toLowerCase(),
        ).toContain("ping");
      }, 60_000);

      it("discovers browser MCP tools", async () => {
        const parts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(makeOptions("what MCP tools do you have? list all tool names"))
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const textParts = parts.filter(
          (part): part is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
            part.type === "text-delta",
        );
        const fullText = textParts
          .map((part) => part.delta)
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
