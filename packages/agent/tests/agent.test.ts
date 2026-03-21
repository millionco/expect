import { describe, expect, it } from "vite-plus/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, Layer, Option, Stream } from "effect";
import { Agent } from "../src/agent.js";
import { AgentStreamOptions } from "../src/types.js";

const TEST_LAYERS: [string, Layer.Layer<Agent>][] = [
  // ["claude", Agent.layerClaude],
  ["codex", Agent.layerCodex],
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
        const firstParts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(makeOptions("respond with just the word ping"))
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const finishPart = firstParts.find((part) => part.type === "response-metadata");
        expect(finishPart).toBeDefined();
        const sessionId = finishPart?.type === "response-metadata" ? (finishPart.id ?? "") : "";
        expect(sessionId.length).toBeGreaterThan(0);

        const secondParts = await Effect.gen(function* () {
          const agent = yield* Agent;
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
    });
  });
});
