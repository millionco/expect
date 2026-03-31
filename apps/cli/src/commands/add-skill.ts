import * as fs from "node:fs";
import path from "node:path";
import { type SupportedAgent, toDisplayName, toSkillDir } from "@expect/agent";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { prompts } from "../utils/prompts";
import { spinner } from "../utils/spinner";
import { detectNonInteractive } from "./init-utils";
import { SKILL_CONTENT } from "./skill-content";

const AGENTS_SKILLS_DIR = ".agents/skills";
const SKILL_NAME = "expect";

interface AddSkillOptions {
  yes?: boolean;
  agents: readonly SupportedAgent[];
}

const writeSkillFile = (projectRoot: string) => {
  const skillDir = path.join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
  const skillPath = path.join(skillDir, "SKILL.md");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillPath, SKILL_CONTENT, "utf8");
};

const ensureAgentSymlink = (projectRoot: string, agent: SupportedAgent): boolean => {
  const agentSkillDir = toSkillDir(agent);
  const symlinkPath = path.join(projectRoot, agentSkillDir);
  const targetPath = path.relative(
    path.dirname(symlinkPath),
    path.join(projectRoot, AGENTS_SKILLS_DIR),
  );

  if (fs.existsSync(symlinkPath)) {
    try {
      const stats = fs.lstatSync(symlinkPath);
      if (stats.isSymbolicLink()) {
        const existing = fs.readlinkSync(symlinkPath);
        if (existing === targetPath) return true;
        fs.unlinkSync(symlinkPath);
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }

  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
  fs.symlinkSync(targetPath, symlinkPath);
  return true;
};

export const runAddSkill = async (options: AddSkillOptions) => {
  const nonInteractive = detectNonInteractive(options.yes ?? false);
  const projectRoot = process.cwd();

  let selectedAgents: SupportedAgent[] = [...options.agents];

  if (!nonInteractive) {
    if (options.agents.length === 0) {
      logger.error("No supported coding agents detected on your machine.");
      return;
    }

    const response = await prompts({
      type: "multiselect",
      name: "agents",
      message: `Install the ${highlighter.info("expect")} skill for:`,
      choices: options.agents.map((agent) => ({
        title: toDisplayName(agent),
        value: agent,
        selected: true,
      })),
      instructions: false,
    });

    selectedAgents = response.agents ?? [];
    if (selectedAgents.length === 0) return;
  }

  const skillSpinner = spinner("Installing skill...").start();

  writeSkillFile(projectRoot);

  const linked: string[] = [];
  for (const agent of selectedAgents) {
    if (ensureAgentSymlink(projectRoot, agent)) {
      linked.push(toDisplayName(agent));
    }
  }

  if (linked.length > 0) {
    skillSpinner.succeed(`Skill installed for ${linked.join(", ")}.`);
  } else {
    skillSpinner.succeed("Skill installed.");
  }
};
