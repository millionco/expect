import { ConfigProvider, Effect, Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { inferAgentFromEnv, resolveAgentProvider } from "../src/infer-agent";

const inferWithEnv = (env: Record<string, string>) =>
  Effect.runSync(
    inferAgentFromEnv.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))),
  );

describe("inferAgentFromEnv", () => {
  it("returns none when no agent env vars are set", () => {
    expect(Option.isNone(inferWithEnv({}))).toBe(true);
  });

  it("infers claude from CLAUDECODE", () => {
    expect(Option.getOrThrow(inferWithEnv({ CLAUDECODE: "1" }))).toBe("claude");
  });

  it("infers codex from CODEX_CI", () => {
    expect(Option.getOrThrow(inferWithEnv({ CODEX_CI: "1" }))).toBe("codex");
  });

  it("infers cursor from CURSOR_AGENT", () => {
    expect(Option.getOrThrow(inferWithEnv({ CURSOR_AGENT: "1" }))).toBe("cursor");
  });

  it("infers opencode from OPENCODE", () => {
    expect(Option.getOrThrow(inferWithEnv({ OPENCODE: "1" }))).toBe("opencode");
  });

  it("infers pi from PI_CODING_AGENT_DIR", () => {
    expect(Option.getOrThrow(inferWithEnv({ PI_CODING_AGENT_DIR: "/some/path" }))).toBe("pi");
  });

  it("returns first match when multiple env vars are set", () => {
    expect(Option.getOrThrow(inferWithEnv({ CLAUDECODE: "1", CODEX_CI: "1" }))).toBe("claude");
  });

  it("ignores unrelated env vars", () => {
    expect(Option.isNone(inferWithEnv({ HOME: "/home/user", PATH: "/usr/bin" }))).toBe(true);
  });
});

describe("resolveAgentProvider", () => {
  it("returns override when provided", () => {
    expect(resolveAgentProvider("codex")).toBe("codex");
  });

  it("falls back to claude when no override and no env vars", () => {
    expect(resolveAgentProvider()).toBe("claude");
  });
});
