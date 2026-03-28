import { describe, expect, it } from "vite-plus/test";
import { Effect, Exit } from "effect";
import {
  AcpAdapter,
  AcpProviderNotInstalledError,
  AcpProviderUnauthenticatedError,
} from "../src/acp-client";
import { Agent } from "../src/agent";

describe("AcpAdapter", () => {
  describe("layerCodex", () => {
    it("resolves the codex adapter", async () => {
      const adapter = await Effect.gen(function* () {
        return yield* AcpAdapter;
      }).pipe(Effect.provide(AcpAdapter.layerCodex), Effect.runPromise);

      expect(adapter.provider).toBe("codex");
      expect(adapter.bin).toBe(process.execPath);
      expect(adapter.args[0]).toContain("codex-acp");
    });
  });

  describe("layerClaude", () => {
    it("resolves or fails with auth/install error", async () => {
      const exit = await Effect.gen(function* () {
        return yield* AcpAdapter;
      }).pipe(Effect.provide(AcpAdapter.layerClaude), Effect.runPromiseExit);

      if (Exit.isSuccess(exit)) {
        expect(exit.value.provider).toBe("claude");
        expect(exit.value.bin).toBe(process.execPath);
        expect(exit.value.args[0]).toContain("claude-agent-acp");
      } else {
        const error = exit.cause;
        expect(
          error.toString().includes("AcpProviderNotInstalledError") ||
            error.toString().includes("AcpProviderUnauthenticatedError"),
        ).toBe(true);
      }
    });
  });

  describe("layerCopilot", () => {
    it("resolves with --acp flag when authenticated", async () => {
      const exit = await Effect.gen(function* () {
        return yield* AcpAdapter;
      }).pipe(Effect.provide(AcpAdapter.layerCopilot), Effect.runPromiseExit);

      if (Exit.isSuccess(exit)) {
        expect(exit.value.provider).toBe("copilot");
        expect(exit.value.bin).toBe(process.execPath);
        expect(exit.value.args.at(-1)).toBe("--acp");
      } else {
        const error = exit.cause;
        expect(
          error.toString().includes("AcpProviderNotInstalledError") ||
            error.toString().includes("AcpProviderUnauthenticatedError"),
        ).toBe(true);
      }
    });
  });

  describe("layerGemini", () => {
    it("resolves with --acp flag when authenticated", async () => {
      const exit = await Effect.gen(function* () {
        return yield* AcpAdapter;
      }).pipe(Effect.provide(AcpAdapter.layerGemini), Effect.runPromiseExit);

      if (Exit.isSuccess(exit)) {
        expect(exit.value.provider).toBe("gemini");
        expect(exit.value.bin).toBe(process.execPath);
        expect(exit.value.args.at(-1)).toBe("--acp");
      } else {
        const error = exit.cause;
        expect(
          error.toString().includes("AcpProviderUnauthenticatedError") ||
            error.toString().includes("AcpAdapterNotFoundError"),
        ).toBe(true);
      }
    });
  });

  describe("layerCursor", () => {
    it("resolves or fails with not-installed/auth error", async () => {
      const exit = await Effect.gen(function* () {
        return yield* AcpAdapter;
      }).pipe(Effect.provide(AcpAdapter.layerCursor), Effect.runPromiseExit);

      if (Exit.isSuccess(exit)) {
        expect(exit.value.provider).toBe("cursor");
        expect(exit.value.bin).toBe("agent");
        expect(exit.value.args).toEqual(["acp"]);
      } else {
        const error = exit.cause.toString();
        expect(
          error.includes("AcpProviderNotInstalledError") ||
            error.includes("AcpProviderUnauthenticatedError"),
        ).toBe(true);
      }
    }, 15_000);
  });

  describe("error messages", () => {
    it("copilot not-installed error mentions @github/copilot", () => {
      const error = new AcpProviderNotInstalledError({ provider: "copilot" });
      expect(error.message).toContain("@github/copilot");
    });

    it("copilot unauthenticated error mentions gh auth login", () => {
      const error = new AcpProviderUnauthenticatedError({ provider: "copilot" });
      expect(error.message).toContain("gh auth login");
    });

    it("gemini not-installed error mentions @google/gemini-cli", () => {
      const error = new AcpProviderNotInstalledError({ provider: "gemini" });
      expect(error.message).toContain("@google/gemini-cli");
    });

    it("gemini unauthenticated error mentions gemini auth login", () => {
      const error = new AcpProviderUnauthenticatedError({ provider: "gemini" });
      expect(error.message).toContain("gemini auth login");
    });

    it("cursor not-installed error mentions cursor.com", () => {
      const error = new AcpProviderNotInstalledError({ provider: "cursor" });
      expect(error.message).toContain("cursor.com");
    });

    it("cursor unauthenticated error mentions agent login", () => {
      const error = new AcpProviderUnauthenticatedError({ provider: "cursor" });
      expect(error.message).toContain("agent login");
    });

    it("claude not-installed error mentions code.claude.com", () => {
      const error = new AcpProviderNotInstalledError({ provider: "claude" });
      expect(error.message).toContain("code.claude.com");
    });

    it("codex not-installed error mentions @openai/codex", () => {
      const error = new AcpProviderNotInstalledError({ provider: "codex" });
      expect(error.message).toContain("@openai/codex");
    });
  });

  describe("Agent.layerFor", () => {
    it("maps all backend names to layers", () => {
      const backends = ["claude", "codex", "copilot", "gemini", "cursor"] as const;

      for (const backend of backends) {
        const layer = Agent.layerFor(backend);
        expect(layer).toBeDefined();
      }
    });
  });
});
