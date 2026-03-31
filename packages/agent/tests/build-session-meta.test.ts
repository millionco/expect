import { describe, expect, it } from "vite-plus/test";
import { buildSessionMeta } from "../src/build-session-meta";

describe("buildSessionMeta", () => {
  it("returns undefined without a system prompt", () => {
    const sessionMeta = buildSessionMeta({});

    expect(sessionMeta).toBeUndefined();
  });

  it("returns the system prompt for codex", () => {
    const sessionMeta = buildSessionMeta({
      systemPrompt: "Test prompt",
    });

    expect(sessionMeta).toEqual({ systemPrompt: "Test prompt" });
  });

  it("returns the system prompt for claude", () => {
    const sessionMeta = buildSessionMeta({
      systemPrompt: "Test prompt",
    });

    expect(sessionMeta).toEqual({ systemPrompt: "Test prompt" });
  });
});
