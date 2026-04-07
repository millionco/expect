import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { type BrowserMode, readExpectConfig, writeExpectConfig } from "../src/utils/expect-config";

describe("expect-config", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "expect-config-"));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  describe("writeExpectConfig", () => {
    it("creates .expect directory and config.json", () => {
      writeExpectConfig(projectRoot, { browserMode: "cdp" });

      const configPath = path.join(projectRoot, ".expect", "config.json");
      expect(fs.existsSync(configPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(content).toEqual({ browserMode: "cdp" });
    });

    it("overwrites existing config", () => {
      writeExpectConfig(projectRoot, { browserMode: "cdp" });
      writeExpectConfig(projectRoot, { browserMode: "headless" });

      const configPath = path.join(projectRoot, ".expect", "config.json");
      const content = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(content).toEqual({ browserMode: "headless" });
    });

    it("writes all browser modes", () => {
      for (const mode of ["cdp", "headed", "headless"] as const) {
        writeExpectConfig(projectRoot, { browserMode: mode });
        const content = JSON.parse(
          fs.readFileSync(path.join(projectRoot, ".expect", "config.json"), "utf-8"),
        );
        expect(content.browserMode).toBe(mode);
      }
    });
  });

  describe("readExpectConfig", () => {
    it("reads a valid config", () => {
      writeExpectConfig(projectRoot, { browserMode: "headed" });

      const config = readExpectConfig(projectRoot);
      expect(config).toEqual({ browserMode: "headed" });
    });

    it("returns undefined when config file does not exist", () => {
      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("returns undefined for invalid JSON", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), "not json");

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("returns undefined for null JSON", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), "null");

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("returns undefined for array JSON", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), "[]");

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("returns undefined for invalid browserMode", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), '{"browserMode":"invalid"}');

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("returns undefined for missing browserMode field", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), '{"foo":"bar"}');

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("roundtrips all browser modes", () => {
      for (const mode of ["cdp", "headed", "headless"] as const) {
        writeExpectConfig(projectRoot, { browserMode: mode });
        const config = readExpectConfig(projectRoot);
        expect(config).toEqual({ browserMode: mode });
      }
    });

    it("ignores extra fields and only returns browserMode", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, "config.json"),
        '{"browserMode":"cdp","extra":"stuff","nested":{"a":1}}',
      );

      const config = readExpectConfig(projectRoot);
      expect(config).toEqual({ browserMode: "cdp" });
    });

    it("returns undefined for empty object", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), "{}");

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("returns undefined for empty file", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), "");

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("returns undefined when browserMode is a number", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), '{"browserMode":42}');

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("returns undefined when browserMode is boolean", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), '{"browserMode":true}');

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });
  });

  describe("writeExpectConfig edge cases", () => {
    it("creates nested .expect dir even if projectRoot is deep", () => {
      const deepRoot = path.join(projectRoot, "a", "b", "c");
      fs.mkdirSync(deepRoot, { recursive: true });
      writeExpectConfig(deepRoot, { browserMode: "headed" });

      const config = readExpectConfig(deepRoot);
      expect(config).toEqual({ browserMode: "headed" });
    });

    it("writes valid JSON with trailing newline", () => {
      writeExpectConfig(projectRoot, { browserMode: "headless" });

      const raw = fs.readFileSync(path.join(projectRoot, ".expect", "config.json"), "utf-8");
      expect(raw.endsWith("\n")).toBe(true);
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  describe("BrowserMode type safety", () => {
    it("only accepts valid browser modes", () => {
      const validModes: BrowserMode[] = ["cdp", "headed", "headless"];
      for (const mode of validModes) {
        writeExpectConfig(projectRoot, { browserMode: mode });
        expect(readExpectConfig(projectRoot)?.browserMode).toBe(mode);
      }
    });
  });

  describe("realistic project fixtures", () => {
    it("reads config when .expect/ already has logs", () => {
      const expectDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(expectDir, { recursive: true });
      fs.writeFileSync(path.join(expectDir, "logs.md"), "[2025-01-01] some log\n");

      writeExpectConfig(projectRoot, { browserMode: "cdp" });

      expect(fs.existsSync(path.join(expectDir, "logs.md"))).toBe(true);
      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "cdp" });
    });

    it("preserves other files in .expect/ when writing config", () => {
      const expectDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(expectDir, { recursive: true });
      fs.writeFileSync(path.join(expectDir, "logs.md"), "existing logs\n");
      fs.writeFileSync(path.join(expectDir, "session.json"), '{"id":"abc"}');

      writeExpectConfig(projectRoot, { browserMode: "headed" });

      expect(fs.readFileSync(path.join(expectDir, "logs.md"), "utf-8")).toBe("existing logs\n");
      expect(fs.readFileSync(path.join(expectDir, "session.json"), "utf-8")).toBe('{"id":"abc"}');
      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headed" });
    });

    it("works alongside existing skill directories", () => {
      const skillDir = path.join(projectRoot, ".agents", "skills", "expect");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: expect\n---\n");

      const claudeSkillDir = path.join(projectRoot, ".claude", "skills", "expect");
      fs.mkdirSync(claudeSkillDir, { recursive: true });
      fs.writeFileSync(path.join(claudeSkillDir, "SKILL.md"), "---\nname: expect\n---\n");

      writeExpectConfig(projectRoot, { browserMode: "cdp" });

      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "cdp" });
      expect(fs.existsSync(path.join(skillDir, "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(claudeSkillDir, "SKILL.md"))).toBe(true);
    });

    it("switching modes overwrites previous config cleanly", () => {
      writeExpectConfig(projectRoot, { browserMode: "cdp" });
      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "cdp" });

      writeExpectConfig(projectRoot, { browserMode: "headed" });
      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headed" });

      writeExpectConfig(projectRoot, { browserMode: "headless" });
      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });

      writeExpectConfig(projectRoot, { browserMode: "cdp" });
      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "cdp" });
    });

    it("handles config.json that was hand-edited with whitespace", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, "config.json"),
        '  \n{\n  "browserMode" :  "headed" \n}\n  ',
      );

      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headed" });
    });

    it("returns undefined for config.json with BOM marker", () => {
      const configDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), '\ufeff{"browserMode":"headless"}');

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("handles config.json that is a directory (not a file)", () => {
      const configDir = path.join(projectRoot, ".expect", "config.json");
      fs.mkdirSync(configDir, { recursive: true });

      const config = readExpectConfig(projectRoot);
      expect(config).toBeUndefined();
    });

    it("reads config from project root with spaces in path", () => {
      const spacedRoot = path.join(projectRoot, "my project");
      fs.mkdirSync(spacedRoot, { recursive: true });

      writeExpectConfig(spacedRoot, { browserMode: "cdp" });
      expect(readExpectConfig(spacedRoot)).toEqual({ browserMode: "cdp" });
    });
  });
});
