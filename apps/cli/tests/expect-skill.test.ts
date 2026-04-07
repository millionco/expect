import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  AGENTS_SKILLS_DIR,
  detectInstalledSkillAgents,
  getExpectSkillStatus,
  hasInstalledExpectSkill,
  SKILL_NAME,
} from "../src/utils/expect-skill";

const makeSkillFile = (version: string, body: string) => `---
name: expect
metadata:
  version: "${version}"
---

${body}
`;

describe("expect-skill", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "expect-skill-"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("reports the installed skill as current when the bundled file matches upstream", async () => {
    const installedSkill = makeSkillFile("2.2.0", "same skill");
    const skillDir = join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), installedSkill);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => installedSkill,
      }),
    );

    const status = await Effect.runPromise(getExpectSkillStatus(projectRoot));

    expect(status).toEqual({
      installed: true,
      isLatest: true,
      installedVersion: "2.2.0",
      latestVersion: "2.2.0",
    });
  });

  it("reports the installed skill as outdated when the upstream file differs", async () => {
    const installedSkill = makeSkillFile("2.1.0", "old skill");
    const latestSkill = makeSkillFile("2.2.0", "new skill");
    const skillDir = join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), installedSkill);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => latestSkill,
      }),
    );

    const status = await Effect.runPromise(getExpectSkillStatus(projectRoot));

    expect(status).toEqual({
      installed: true,
      isLatest: false,
      installedVersion: "2.1.0",
      latestVersion: "2.2.0",
    });
  });

  it("detects which installed agents already have the expect skill directory", () => {
    const claudeSkillsDir = join(projectRoot, ".claude", "skills");
    mkdirSync(claudeSkillsDir, { recursive: true });
    mkdirSync(join(claudeSkillsDir, SKILL_NAME), { recursive: true });

    const cursorSkillsDir = join(projectRoot, ".cursor", "skills");
    mkdirSync(cursorSkillsDir, { recursive: true });

    const installedAgents = detectInstalledSkillAgents(projectRoot, ["claude", "cursor", "codex"]);

    expect(installedAgents).toEqual(["claude"]);
  });

  it("treats an agent-local skill install as already installed", () => {
    const claudeSkillDir = join(projectRoot, ".claude", "skills", SKILL_NAME);
    mkdirSync(claudeSkillDir, { recursive: true });
    writeFileSync(join(claudeSkillDir, "SKILL.md"), makeSkillFile("2.2.0", "same skill"));

    expect(hasInstalledExpectSkill(projectRoot, ["claude", "cursor"])).toBe(true);
  });

  it("reports not installed when neither shared nor agent-local skills exist", () => {
    expect(hasInstalledExpectSkill(projectRoot, ["claude", "cursor"])).toBe(false);
  });
});
