import * as fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { type SupportedAgent, toDisplayName, toSkillDir } from "@expect/agent";
import { Effect, Schema } from "effect";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { prompts } from "../utils/prompts";
import { spinner } from "../utils/spinner";
import {
  AGENTS_SKILLS_DIR,
  formatSkillVersion,
  getExpectSkillStatus,
  SKILL_NAME,
  SKILL_SOURCE_DIR,
  SKILL_TARBALL_URL,
} from "../utils/expect-skill";
import { SKILL_FETCH_TIMEOUT_MS } from "../constants";
import { detectNonInteractive } from "./init-utils";
const SKILL_BRANCH = "main";
const SKILL_ARCHIVE_PREFIX = `expect-${SKILL_BRANCH}/${SKILL_SOURCE_DIR}/`;

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

class ExpectSkillDownloadError extends Schema.ErrorClass<ExpectSkillDownloadError>(
  "ExpectSkillDownloadError",
)({
  _tag: Schema.tag("ExpectSkillDownloadError"),
  reason: Schema.String,
}) {
  message = `Failed to download expect skill: ${this.reason}`;
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
        const destPath = path.join(destDir, relativePath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, tar.subarray(offset, offset + size));
      }
    }

    offset += Math.ceil(size / TAR_HEADER_SIZE) * TAR_HEADER_SIZE;
  }
};

const downloadSkill = Effect.fn("Skill.downloadSkill")(function* (skillDir: string) {
  yield* Effect.annotateCurrentSpan({ skillDir });

  const response: Response = yield* Effect.tryPromise({
    try: () => fetch(SKILL_TARBALL_URL),
    catch: (cause) => new ExpectSkillDownloadError({ reason: String(cause) }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: SKILL_FETCH_TIMEOUT_MS,
      onTimeout: () => new ExpectSkillDownloadError({ reason: "request timed out" }).asEffect(),
    }),
  );

  if (!response.ok) {
    return yield* new ExpectSkillDownloadError({
      reason: `GitHub returned ${response.status}`,
    });
  }

  const compressed: ArrayBuffer = yield* Effect.tryPromise({
    try: () => response.arrayBuffer(),
    catch: (cause) => new ExpectSkillDownloadError({ reason: String(cause) }),
  });

  yield* Effect.try({
    try: () => {
      const tar = gunzipSync(Buffer.from(compressed));
      fs.mkdirSync(skillDir, { recursive: true });
      extractTarEntries(tar, SKILL_ARCHIVE_PREFIX, skillDir);
    },
    catch: (cause) => new ExpectSkillDownloadError({ reason: String(cause) }),
  });
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

type AgentSymlinkResult = "linked" | "already-linked" | string;

const getExistingPathStats = (targetPath: string): fs.Stats | fs.Dirent | undefined => {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
};

export const ensureAgentSymlink = (
  projectRoot: string,
  agent: SupportedAgent,
): AgentSymlinkResult => {
  const skillSourceDir = path.join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
  const agentSkillDir = path.join(projectRoot, toSkillDir(agent));
  const symlinkPath = path.join(agentSkillDir, SKILL_NAME);
  const targetPath = path.relative(path.dirname(symlinkPath), skillSourceDir);

  try {
    const existingPathStats = getExistingPathStats(symlinkPath);
    if (existingPathStats?.isSymbolicLink()) {
      if (fs.readlinkSync(symlinkPath) === targetPath) return "already-linked";
      fs.unlinkSync(symlinkPath);
    } else if (existingPathStats !== undefined) {
      fs.rmSync(symlinkPath, { recursive: true, force: true });
    }

    fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
    fs.symlinkSync(targetPath, symlinkPath);
    return "linked";
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
  const skillDir = path.join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
  const skillStatus = await Effect.runPromise(getExpectSkillStatus(projectRoot));
  let skillOperation: "installed" | "updated" | "current" | "unverified" = "installed";

  if (skillStatus.installed && skillStatus.isLatest === true) {
    skillSpinner.stop();
    skillOperation = "current";
  } else if (skillStatus.installed && skillStatus.isLatest === undefined) {
    skillSpinner.stop();
    skillOperation = "unverified";
  } else {
    if (skillStatus.installed) {
      skillSpinner.text = "Updating skill from GitHub...";
      skillOperation = "updated";
    }

    const downloaded = await Effect.runPromise(
      downloadSkill(skillDir).pipe(
        Effect.as(true),
        Effect.catchTag("ExpectSkillDownloadError", () => Effect.succeed(false)),
      ),
    );

    if (!downloaded) {
      skillSpinner.fail("Failed to download skill files from GitHub.");
      logger.error("Check your internet connection and try again.");
      return;
    }
  }

  const results = selectedAgents.map((agent) => ({
    agent,
    result: ensureAgentSymlink(projectRoot, agent),
  }));

  const linked = results
    .filter((entry) => entry.result === "linked")
    .map((entry) => toDisplayName(entry.agent));
  const alreadyLinked = results
    .filter((entry) => entry.result === "already-linked")
    .map((entry) => toDisplayName(entry.agent));
  const failed = results.filter(
    (entry) => entry.result !== "linked" && entry.result !== "already-linked",
  );

  for (const { agent, result } of failed) {
    logger.warn(`  ${toDisplayName(agent)}: ${result}`);
  }

  if (linked.length === 0 && alreadyLinked.length === 0 && failed.length > 0) {
    if (skillOperation === "updated") {
      skillSpinner.warn("Skill files were updated, but agent links could not be created.");
      return;
    }

    if (skillOperation === "installed") {
      skillSpinner.warn("Skill files were installed, but agent links could not be created.");
      return;
    }

    logger.warn("Skill files are present, but agent links could not be created.");
    return;
  }

  if (skillOperation === "current") {
    const version = formatSkillVersion(skillStatus.latestVersion ?? skillStatus.installedVersion);
    if (alreadyLinked.length > 0 && linked.length === 0) {
      logger.success(`Skill already installed (${version}) for ${alreadyLinked.join(", ")}.`);
      return;
    }
    if (linked.length > 0) {
      logger.success(`Skill already up to date (${version}). Linked it for ${linked.join(", ")}.`);
      return;
    }
    logger.success(`Skill already installed (${version}).`);
    return;
  }

  if (skillOperation === "unverified") {
    logger.warn("Could not verify whether the installed skill is the latest version.");
    if (alreadyLinked.length > 0 && linked.length === 0) {
      logger.success(`Skill already installed for ${alreadyLinked.join(", ")}.`);
      return;
    }
    if (linked.length > 0) {
      logger.success(`Skill already present. Linked it for ${linked.join(", ")}.`);
      return;
    }
    logger.success("Skill already installed.");
    return;
  }

  if (skillOperation === "updated") {
    if (linked.length > 0 || alreadyLinked.length > 0) {
      skillSpinner.succeed(`Skill updated for ${[...linked, ...alreadyLinked].join(", ")}.`);
      return;
    }
    skillSpinner.succeed("Skill updated.");
    return;
  }

  if (linked.length > 0) {
    skillSpinner.succeed(`Skill installed for ${linked.join(", ")}.`);
  } else if (alreadyLinked.length > 0) {
    skillSpinner.succeed(`Skill installed for ${alreadyLinked.join(", ")}.`);
  } else {
    skillSpinner.succeed("Skill installed.");
  }
};
