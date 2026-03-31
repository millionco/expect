import { describe, expect, it } from "vite-plus/test";
import { buildSessionMeta } from "../src/build-session-meta";

describe("buildSessionMeta", () => {
  it("returns undefined for non-claude providers without a system prompt", () => {
    const sessionMeta = buildSessionMeta({
      provider: "codex",
      metadata: { isGitHubActions: true },
    });

    expect(sessionMeta).toBeUndefined();
  });

  it("returns only systemPrompt for non-claude providers with a system prompt", () => {
    const sessionMeta = buildSessionMeta({
      provider: "codex",
      systemPrompt: "Test prompt",
      metadata: { isGitHubActions: true },
    });

    expect(sessionMeta).toEqual({ systemPrompt: "Test prompt" });
  });

  it("keeps the system prompt for claude outside GitHub Actions", () => {
    const sessionMeta = buildSessionMeta({
      provider: "claude",
      systemPrompt: "Test prompt",
      metadata: { isGitHubActions: false },
    });

    expect(sessionMeta).toEqual({ systemPrompt: "Test prompt" });
  });

  it("sets Claude effort to high in GitHub Actions", () => {
    const sessionMeta = buildSessionMeta({
      provider: "claude",
      metadata: { isGitHubActions: true },
    });

    expect(sessionMeta).toEqual({
      claudeCode: {
        options: {
          effort: "high",
          thinking: { type: "adaptive" },
        },
      },
    });
  });

  it("combines the system prompt with GitHub Actions settings", () => {
    const sessionMeta = buildSessionMeta({
      provider: "claude",
      systemPrompt: "Test prompt",
      metadata: { isGitHubActions: true },
    });

    expect(sessionMeta).toEqual({
      systemPrompt: "Test prompt",
      claudeCode: {
        options: {
          effort: "high",
          thinking: { type: "adaptive" },
        },
      },
    });
  });
});
