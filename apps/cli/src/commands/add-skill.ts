import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { type SupportedAgent, toDisplayName, toSkillDir } from "@expect/agent";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { prompts } from "../utils/prompts";
import { spinner } from "../utils/spinner";
import { detectNonInteractive, tryRun } from "./init-utils";

const AGENTS_SKILLS_DIR = ".agents/skills";
const SKILL_NAME = "expect";
const SKILL_REPO = "millionco/expect";
const SKILL_BRANCH = "main";
const SKILL_SOURCE_DIR = "packages/expect-skill";
const SKILL_TARBALL_URL = `https://codeload.github.com/${SKILL_REPO}/tar.gz/${SKILL_BRANCH}`;
// HACK: GitHub tarballs use {repo-name}-{branch} as the root directory
const SKILL_ARCHIVE_PATH = `${SKILL_REPO.split("/")[1]}-${SKILL_BRANCH}/${SKILL_SOURCE_DIR}`;
const SKILL_STRIP_COMPONENTS = SKILL_SOURCE_DIR.split("/").length + 1;

interface AddSkillOptions {
  yes?: boolean;
  agents: readonly SupportedAgent[];
}

const downloadSkill = async (skillDir: string): Promise<boolean> => {
  mkdirSync(skillDir, { recursive: true });
  return tryRun(
    `curl -sfL "${SKILL_TARBALL_URL}" | tar xz --strip-components=${SKILL_STRIP_COMPONENTS} -C "${skillDir}" "${SKILL_ARCHIVE_PATH}"`,
  );
};

const selectAgents = async (agents: readonly SupportedAgent[], nonInteractive: boolean) => {
  if (nonInteractive) return [...agents];

  if (agents.length === 0) {
    logger.error("No supported coding agents detected on your machine.");
    return [];
  }

  const response = await prompts({
    type: "multiselect",
    name: "agents",
    message: `Install the ${highlighter.info("expect")} skill for:`,
    choices: agents.map((agent) => ({
      title: toDisplayName(agent),
      value: agent,
      selected: true,
    })),
    instructions: false,
  });

  return (response.agents ?? []) as SupportedAgent[];
};

const ensureAgentSymlink = (projectRoot: string, agent: SupportedAgent): boolean | string => {
  const skillSourceDir = join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
  const agentSkillDir = join(projectRoot, toSkillDir(agent));
  const symlinkPath = join(agentSkillDir, SKILL_NAME);
  const targetPath = relative(dirname(symlinkPath), skillSourceDir);

  try {
    if (existsSync(symlinkPath)) {
      const stats = lstatSync(symlinkPath);
      if (!stats.isSymbolicLink()) return `${symlinkPath} exists and is not a symlink`;
      if (readlinkSync(symlinkPath) === targetPath) return true;
      unlinkSync(symlinkPath);
    }

    mkdirSync(dirname(symlinkPath), { recursive: true });
    symlinkSync(targetPath, symlinkPath);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `Failed to create symlink: ${reason}`;
  }
};

export const runAddSkill = async (options: AddSkillOptions) => {
  const projectRoot = process.cwd();
  const nonInteractive = detectNonInteractive(options.yes ?? false);
  const selectedAgents = await selectAgents(options.agents, nonInteractive);
  if (selectedAgents.length === 0) return;

  const skillSpinner = spinner("Downloading skill from GitHub...").start();
  const skillDir = join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
  const downloaded = await downloadSkill(skillDir);

  if (!downloaded) {
    skillSpinner.fail("Failed to download skill files from GitHub.");
    logger.error("Ensure curl and tar are installed, and check your internet connection.");
    return;
  }

  const results = selectedAgents.map((agent) => ({
    agent,
    result: ensureAgentSymlink(projectRoot, agent),
  }));

  const linked = results
    .filter((entry) => entry.result === true)
    .map((entry) => toDisplayName(entry.agent));
  const failed = results.filter((entry) => typeof entry.result === "string");

  for (const { agent, result } of failed) {
    logger.warn(`  ${toDisplayName(agent)}: ${result}`);
  }

  if (linked.length > 0) {
    skillSpinner.succeed(`Skill installed for ${linked.join(", ")}.`);
  } else {
    skillSpinner.succeed("Skill installed.");
  }
};
