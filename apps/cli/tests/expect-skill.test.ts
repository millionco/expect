import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
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
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "expect-skill-"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("reports the installed skill as current when the bundled file matches upstream", async () => {
    const installedSkill = makeSkillFile("2.2.0", "same skill");
    const skillDir = path.join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), installedSkill);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => installedSkill,
      }),
    );

    const status = await Effect.runPromise(
      getExpectSkillStatus(projectRoot).pipe(Effect.provide(NodeServices.layer)),
    );

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
    const skillDir = path.join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), installedSkill);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => latestSkill,
      }),
    );

    const status = await Effect.runPromise(
      getExpectSkillStatus(projectRoot).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(status).toEqual({
      installed: true,
      isLatest: false,
      installedVersion: "2.1.0",
      latestVersion: "2.2.0",
    });
  });

  it("detects which installed agents already have the expect skill directory", async () => {
    const claudeSkillsDir = path.join(projectRoot, ".claude", "skills");
    fs.mkdirSync(claudeSkillsDir, { recursive: true });
    fs.mkdirSync(path.join(claudeSkillsDir, SKILL_NAME), { recursive: true });

    const cursorSkillsDir = path.join(projectRoot, ".cursor", "skills");
    fs.mkdirSync(cursorSkillsDir, { recursive: true });

    const installedAgents = await Effect.runPromise(
      detectInstalledSkillAgents(projectRoot, ["claude", "cursor", "codex"]).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );

    expect(installedAgents).toEqual(["claude"]);
  });

  it("treats an agent-local skill install as already installed", async () => {
    const claudeSkillDir = path.join(projectRoot, ".claude", "skills", SKILL_NAME);
    fs.mkdirSync(claudeSkillDir, { recursive: true });
    fs.writeFileSync(path.join(claudeSkillDir, "SKILL.md"), makeSkillFile("2.2.0", "same skill"));

    const result = await Effect.runPromise(
      hasInstalledExpectSkill(projectRoot, ["claude", "cursor"]).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(result).toBe(true);
  });

  it("reports not installed when neither shared nor agent-local skills exist", async () => {
    const result = await Effect.runPromise(
      hasInstalledExpectSkill(projectRoot, ["claude", "cursor"]).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(result).toBe(false);
  });
});
