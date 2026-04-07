import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { gunzipSync } from "node:zlib";
import { type SupportedAgent, toDisplayName, toSkillDir } from "@expect/agent";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { prompts } from "../utils/prompts";
import { spinner } from "../utils/spinner";
import { detectNonInteractive } from "./init-utils";

const AGENTS_SKILLS_DIR = ".agents/skills";
const SKILL_NAME = "expect";
const SKILL_REPO = "millionco/expect";
const SKILL_BRANCH = "main";
const SKILL_SOURCE_DIR = "packages/expect-skill";
const SKILL_TARBALL_URL = `https://codeload.github.com/${SKILL_REPO}/tar.gz/${SKILL_BRANCH}`;
// HACK: GitHub tarballs use {repo-name}-{branch} as the root directory
const SKILL_ARCHIVE_PREFIX = `${SKILL_REPO.split("/")[1]}-${SKILL_BRANCH}/${SKILL_SOURCE_DIR}/`;

const TAR_HEADER_SIZE = 512;
const TAR_NAME_OFFSET = 0;
const TAR_NAME_LENGTH = 100;
const TAR_SIZE_OFFSET = 124;
const TAR_SIZE_LENGTH = 12;
const TAR_TYPE_OFFSET = 156;
const TAR_TYPE_REGULAR_FILE = 48;
const TAR_TYPE_REGULAR_FILE_ALT = 0;

interface AddSkillOptions {
  yes?: boolean;
  agents: readonly SupportedAgent[];
}

export const readNullTerminated = (buffer: Buffer, start: number, length: number): string => {
  const raw = buffer.subarray(start, start + length).toString("utf8");
  const nullIndex = raw.indexOf("\x00");
  return nullIndex === -1 ? raw : raw.slice(0, nullIndex);
};

export const extractTarEntries = (tar: Buffer, prefix: string, destDir: string) => {
  let offset = 0;

  while (offset + TAR_HEADER_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + TAR_HEADER_SIZE);
    if (header.every((byte) => byte === 0)) break;

    const name = readNullTerminated(header, TAR_NAME_OFFSET, TAR_NAME_LENGTH);
    const sizeOctal = readNullTerminated(header, TAR_SIZE_OFFSET, TAR_SIZE_LENGTH).trim();
    const size = parseInt(sizeOctal, 8) || 0;
    const typeFlag = header[TAR_TYPE_OFFSET];

    offset += TAR_HEADER_SIZE;

    const isRegularFile =
      typeFlag === TAR_TYPE_REGULAR_FILE || typeFlag === TAR_TYPE_REGULAR_FILE_ALT;

    if (name.startsWith(prefix) && isRegularFile) {
      const relativePath = name.slice(prefix.length);
      if (relativePath) {
        const destPath = join(destDir, relativePath);
        mkdirSync(dirname(destPath), { recursive: true });
        writeFileSync(destPath, tar.subarray(offset, offset + size));
      }
    }

    offset += Math.ceil(size / TAR_HEADER_SIZE) * TAR_HEADER_SIZE;
  }
};

const downloadSkill = async (skillDir: string): Promise<boolean> => {
  try {
    const response = await fetch(SKILL_TARBALL_URL);
    if (!response.ok) return false;

    const compressed = Buffer.from(await response.arrayBuffer());
    const tar = gunzipSync(compressed);

    mkdirSync(skillDir, { recursive: true });
    extractTarEntries(tar, SKILL_ARCHIVE_PREFIX, skillDir);
    return true;
  } catch {
    return false;
  }
};

const getPathStats = (path: string) => {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
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

export const ensureAgentSymlink = (projectRoot: string, agent: SupportedAgent): boolean | string => {
  const skillSourceDir = join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
  const agentSkillDir = join(projectRoot, toSkillDir(agent));
  const symlinkPath = join(agentSkillDir, SKILL_NAME);
  const targetPath = relative(dirname(symlinkPath), skillSourceDir);

  try {
    const stats = getPathStats(symlinkPath);
    if (stats) {
      if (stats.isSymbolicLink()) {
        if (readlinkSync(symlinkPath) === targetPath) return true;
        unlinkSync(symlinkPath);
      } else {
        rmSync(symlinkPath, { recursive: true, force: true });
      }
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
    logger.error("Check your internet connection and try again.");
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
