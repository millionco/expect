import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { Effect, Exit, Schema } from "effect";
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

export class SkillDownloadError extends Schema.ErrorClass<SkillDownloadError>("SkillDownloadError")(
  {
    _tag: Schema.tag("SkillDownloadError"),
  },
) {
  message = "Failed to download skill files from GitHub";
}

const downloadSkill = Effect.fn("downloadSkill")(function* (skillDir: string) {
  yield* Effect.sync(() => mkdirSync(skillDir, { recursive: true }));

  const success = yield* Effect.tryPromise({
    try: () =>
      tryRun(
        `curl -sfL "${SKILL_TARBALL_URL}" | tar xz --strip-components=${SKILL_STRIP_COMPONENTS} -C "${skillDir}" "${SKILL_ARCHIVE_PATH}"`,
      ),
    catch: () => new SkillDownloadError(),
  });

  if (!success) {
    return yield* new SkillDownloadError();
  }
});

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

const ensureAgentSymlink = Effect.fn("ensureAgentSymlink")(function* (
  projectRoot: string,
  agent: SupportedAgent,
) {
  const symlinkPath = join(projectRoot, toSkillDir(agent));
  const targetPath = relative(dirname(symlinkPath), join(projectRoot, AGENTS_SKILLS_DIR));

  if (existsSync(symlinkPath)) {
    const stats = lstatSync(symlinkPath);
    if (!stats.isSymbolicLink()) return false;
    if (readlinkSync(symlinkPath) === targetPath) return true;
    unlinkSync(symlinkPath);
  }

  mkdirSync(dirname(symlinkPath), { recursive: true });
  symlinkSync(targetPath, symlinkPath);
  return true;
});

export const runAddSkill = async (options: AddSkillOptions) => {
  const projectRoot = process.cwd();
  const nonInteractive = detectNonInteractive(options.yes ?? false);
  const selectedAgents = await selectAgents(options.agents, nonInteractive);
  if (selectedAgents.length === 0) return;

  const skillSpinner = spinner("Downloading skill from GitHub...").start();
  const skillDir = join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
  const exit = await Effect.runPromiseExit(downloadSkill(skillDir));

  if (Exit.isFailure(exit)) {
    skillSpinner.fail("Failed to download skill files from GitHub.");
    logger.error("Ensure curl and tar are installed, and check your internet connection.");
    return;
  }

  const results = await Effect.runPromise(
    Effect.forEach(selectedAgents, (agent) =>
      ensureAgentSymlink(projectRoot, agent).pipe(Effect.catchDefect(() => Effect.succeed(false))),
    ),
  );

  const linked = selectedAgents.filter((_, index) => results[index]).map(toDisplayName);

  if (linked.length > 0) {
    skillSpinner.succeed(`Skill installed for ${linked.join(", ")}.`);
  } else {
    skillSpinner.succeed("Skill installed.");
  }
};
