import { describe, expect, it } from "vite-plus/test";
import { KNOWN_ACP_AGENTS, AcpAgentConfig } from "../src/acp-client.js";

describe("ACP Agent Config", () => {
  describe("KNOWN_ACP_AGENTS", () => {
    it("contains gemini-cli", () => {
      const config = KNOWN_ACP_AGENTS["gemini-cli"];
      expect(config).toBeDefined();
      expect(config.command).toBe("gemini");
      expect(config.displayName).toBe("Gemini CLI");
    });

    it("contains claude-code", () => {
      const config = KNOWN_ACP_AGENTS["claude-code"];
      expect(config).toBeDefined();
      expect(config.command).toBe("claude");
      expect(config.displayName).toBe("Claude Code");
    });

    it("contains codex-cli", () => {
      const config = KNOWN_ACP_AGENTS["codex-cli"];
      expect(config).toBeDefined();
      expect(config.command).toBe("codex");
    });

    it("contains opencode", () => {
      const config = KNOWN_ACP_AGENTS["opencode"];
      expect(config).toBeDefined();
      expect(config.command).toBe("opencode");
    });

    it("contains kiro-cli", () => {
      const config = KNOWN_ACP_AGENTS["kiro-cli"];
      expect(config).toBeDefined();
      expect(config.command).toBe("kiro");
    });

    it("contains copilot", () => {
      const config = KNOWN_ACP_AGENTS["copilot"];
      expect(config).toBeDefined();
      expect(config.command).toBe("gh");
      expect(config.args).toEqual(["copilot", "--acp"]);
      expect(config.displayName).toBe("GitHub Copilot");
    });

    it("all configs have required fields", () => {
      for (const [_key, config] of Object.entries(KNOWN_ACP_AGENTS)) {
        expect(config.command.length).toBeGreaterThan(0);
        expect(config.displayName.length).toBeGreaterThan(0);
        expect(Array.isArray(config.args)).toBe(true);
      }
    });
  });

  describe("AcpAgentConfig", () => {
    it("creates a config with required fields", () => {
      const config = new AcpAgentConfig({
        command: "test-agent",
        args: ["--flag"],
        displayName: "Test Agent",
      });
      expect(config.command).toBe("test-agent");
      expect(config.args).toEqual(["--flag"]);
      expect(config.displayName).toBe("Test Agent");
    });
  });
});
