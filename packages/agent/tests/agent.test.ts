import { describe, expect, it } from "vite-plus/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, Stream } from "effect";
import { Agent } from "../src/agent.js";
import { AgentStreamOptions } from "../src/types.js";

const collectStream = (parts: Stream.Stream<LanguageModelV3StreamPart, unknown>) =>
  Stream.runCollect(parts).pipe(Effect.map((chunk) => [...chunk]));

const makeOptions = (prompt: string): AgentStreamOptions =>
  new AgentStreamOptions({
    cwd: process.cwd(),
    model: "claude-sonnet-4-20250514",
    sessionId: "",
    prompt,
    systemPrompt: "",
  });

describe("Agent", () => {
  describe("claude", () => {
    it("streams text response", async () => {
      const parts = await Effect.gen(function* () {
        const agent = yield* Agent;
        return yield* collectStream(agent.stream(makeOptions("respond with just the word hello")));
      }).pipe(Effect.provide(Agent.layerClaude), Effect.runPromise);

      const textParts = parts.filter(
        (part): part is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
          part.type === "text-delta",
      );
      const fullText = textParts.map((part) => part.delta).join("");
      expect(fullText.toLowerCase()).toContain("hello");
    }, 30_000);

    it("passes cwd to agent", async () => {
      const targetCwd = "/tmp";
      const options = new AgentStreamOptions({
        cwd: targetCwd,
        model: "claude-sonnet-4-20250514",
        sessionId: "",
        prompt: "run pwd and tell me the result",
        systemPrompt: "",
      });

      const parts = await Effect.gen(function* () {
        const agent = yield* Agent;
        return yield* collectStream(agent.stream(options));
      }).pipe(Effect.provide(Agent.layerClaude), Effect.runPromise);

      const toolResults = parts.filter(
        (part): part is Extract<LanguageModelV3StreamPart, { type: "tool-result" }> =>
          part.type === "tool-result",
      );
      const hasCorrectCwd = toolResults.some((part) => part.result.includes(targetCwd));
      expect(hasCorrectCwd).toBe(true);
    }, 60_000);

    it("resumes session with sessionId", async () => {
      const firstParts = await Effect.gen(function* () {
        const agent = yield* Agent;
        return yield* collectStream(agent.stream(makeOptions("respond with just the word ping")));
      }).pipe(Effect.provide(Agent.layerClaude), Effect.runPromise);

      const finishPart = firstParts.find((part) => part.type === "response-metadata");
      expect(finishPart).toBeDefined();
      const sessionId = finishPart?.type === "response-metadata" ? (finishPart.id ?? "") : "";
      expect(sessionId.length).toBeGreaterThan(0);

      const resumeOptions = new AgentStreamOptions({
        cwd: process.cwd(),
        model: "claude-sonnet-4-20250514",
        sessionId,
        prompt: "what was the last word I asked you to say?",
        systemPrompt: "",
      });

      const secondParts = await Effect.gen(function* () {
        const agent = yield* Agent;
        return yield* collectStream(agent.stream(resumeOptions));
      }).pipe(Effect.provide(Agent.layerClaude), Effect.runPromise);

      const textParts = secondParts.filter(
        (part): part is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
          part.type === "text-delta",
      );
      const fullText = textParts.map((part) => part.delta).join("");
      expect(fullText.toLowerCase()).toContain("ping");
    }, 60_000);
  });

  describe("codex", () => {
    it("streams text response", async () => {
      const parts = await Effect.gen(function* () {
        const agent = yield* Agent;
        return yield* collectStream(agent.stream(makeOptions("respond with just the word hello")));
      }).pipe(Effect.provide(Agent.layerCodex), Effect.runPromise);

      const textParts = parts.filter(
        (part): part is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
          part.type === "text-delta",
      );
      const fullText = textParts.map((part) => part.delta).join("");
      expect(fullText.toLowerCase()).toContain("hello");
    }, 30_000);

    it("passes cwd to agent", async () => {
      const targetCwd = "/tmp";
      const options = new AgentStreamOptions({
        cwd: targetCwd,
        model: "codex",
        sessionId: "",
        prompt: "run pwd and tell me the result",
        systemPrompt: "",
      });

      const parts = await Effect.gen(function* () {
        const agent = yield* Agent;
        return yield* collectStream(agent.stream(options));
      }).pipe(Effect.provide(Agent.layerCodex), Effect.runPromise);

      const toolResults = parts.filter(
        (part): part is Extract<LanguageModelV3StreamPart, { type: "tool-result" }> =>
          part.type === "tool-result",
      );
      const hasCorrectCwd = toolResults.some((part) => part.result.includes(targetCwd));
      expect(hasCorrectCwd).toBe(true);
    }, 60_000);
  });
});
