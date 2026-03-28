import { describe, expect, it } from "vite-plus/test";
import { Effect } from "effect";
import { AcpAdapter } from "../src/acp-client";
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

  describe("layerCopilot", () => {
    it("resolves the copilot adapter with --acp flag", async () => {
      const adapter = await Effect.gen(function* () {
        return yield* AcpAdapter;
      }).pipe(Effect.provide(AcpAdapter.layerCopilot), Effect.runPromise);

      expect(adapter.provider).toBe("copilot");
      expect(adapter.bin).toBe(process.execPath);
      expect(adapter.args.at(-1)).toBe("--acp");
    });
  });

  describe("layerGemini", () => {
    it("resolves the gemini adapter with --acp flag", async () => {
      const adapter = await Effect.gen(function* () {
        return yield* AcpAdapter;
      }).pipe(Effect.provide(AcpAdapter.layerGemini), Effect.runPromise);

      expect(adapter.provider).toBe("gemini");
      expect(adapter.bin).toBe(process.execPath);
      expect(adapter.args.at(-1)).toBe("--acp");
    });
  });

  describe("layerFor via Agent", () => {
    it("maps all backend names to layers", () => {
      const backends = ["claude", "codex", "copilot", "gemini", "cursor"] as const;

      for (const backend of backends) {
        const layer = Agent.layerFor(backend);
        expect(layer).toBeDefined();
      }
    });
  });
});
