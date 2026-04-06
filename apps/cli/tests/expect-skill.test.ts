import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  AGENTS_SKILLS_DIR,
  detectInstalledSkillAgents,
  getExpectSkillStatus,
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

  it("detects which installed agents already link to the expect skill", () => {
    const sharedSkillDir = join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
    mkdirSync(sharedSkillDir, { recursive: true });

    const claudeSkillsDir = join(projectRoot, ".claude", "skills");
    mkdirSync(claudeSkillsDir, { recursive: true });
    symlinkSync("../../.agents/skills/expect", join(claudeSkillsDir, SKILL_NAME));

    const cursorSkillsDir = join(projectRoot, ".cursor", "skills");
    mkdirSync(cursorSkillsDir, { recursive: true });

    const installedAgents = detectInstalledSkillAgents(projectRoot, ["claude", "cursor", "codex"]);

    expect(installedAgents).toEqual(["claude"]);
  });
});
