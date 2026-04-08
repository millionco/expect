import * as fs from "node:fs";
import * as path from "node:path";
import { gunzipSync } from "node:zlib";
import { type SupportedAgent, toDisplayName, toSkillDir } from "@expect/agent";
import * as NodeServices from "@effect/platform-node/NodeServices";
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
import { resolveProjectRoot } from "../utils/project-root";
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

type AgentSkillCopyResult = "copied" | "already-copied" | string;

const getExistingPathStats = (targetPath: string): fs.Stats | undefined => {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
};

const haveMatchingContents = (sourcePath: string, targetPath: string): boolean => {
  const sourcePathStats = getExistingPathStats(sourcePath);
  const targetPathStats = getExistingPathStats(targetPath);

  if (sourcePathStats === undefined || targetPathStats === undefined) return false;
  if (sourcePathStats.isSymbolicLink() || targetPathStats.isSymbolicLink()) return false;

  if (sourcePathStats.isDirectory() && targetPathStats.isDirectory()) {
    const sourceEntries = fs.readdirSync(sourcePath).sort();
    const targetEntries = fs.readdirSync(targetPath).sort();

    if (sourceEntries.length !== targetEntries.length) return false;

    for (let index = 0; index < sourceEntries.length; index++) {
      if (sourceEntries[index] !== targetEntries[index]) return false;
      if (
        !haveMatchingContents(
          path.join(sourcePath, sourceEntries[index]),
          path.join(targetPath, targetEntries[index]),
        )
      ) {
        return false;
      }
    }

    return true;
  }

  if (sourcePathStats.isFile() && targetPathStats.isFile()) {
    return fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath));
  }

  return false;
};

export const ensureAgentSkillCopy = (
  projectRoot: string,
  agent: SupportedAgent,
): AgentSkillCopyResult => {
  const skillSourceDir = path.join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
  const agentSkillDir = path.join(projectRoot, toSkillDir(agent));
  const installedSkillDir = path.join(agentSkillDir, SKILL_NAME);

  try {
    const existingPathStats = getExistingPathStats(installedSkillDir);
    if (existingPathStats?.isDirectory()) {
      if (!fs.existsSync(path.join(installedSkillDir, "SKILL.md"))) {
        return `${installedSkillDir} exists and is not an expect skill directory`;
      }
      if (haveMatchingContents(skillSourceDir, installedSkillDir)) return "already-copied";
      fs.rmSync(installedSkillDir, { recursive: true, force: true });
    } else if (existingPathStats !== undefined) {
      fs.unlinkSync(installedSkillDir);
    }

    fs.mkdirSync(path.dirname(installedSkillDir), { recursive: true });
    // Copying is more reliable than symlinking across agent CLIs and avoids path, permission, and broken-link edge cases.
    fs.cpSync(skillSourceDir, installedSkillDir, { recursive: true });
    return "copied";
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `Failed to copy skill: ${reason}`;
  }
};

export const runAddSkill = async (options: AddSkillOptions) => {
  const projectRoot = await resolveProjectRoot();
  const nonInteractive = detectNonInteractive(options.yes ?? false);
  const selectedAgents = await selectAgents(options.agents, nonInteractive);
  if (selectedAgents.length === 0) return;

  const skillSpinner = spinner("Downloading skill from GitHub...").start();
  const skillDir = path.join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME);
  const skillStatus = await Effect.runPromise(
    getExpectSkillStatus(projectRoot).pipe(Effect.provide(NodeServices.layer)),
  );
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
    result: ensureAgentSkillCopy(projectRoot, agent),
  }));

  const copied = results
    .filter((entry) => entry.result === "copied")
    .map((entry) => toDisplayName(entry.agent));
  const alreadyCopied = results
    .filter((entry) => entry.result === "already-copied")
    .map((entry) => toDisplayName(entry.agent));
  const failed = results.filter(
    (entry) => entry.result !== "copied" && entry.result !== "already-copied",
  );

  for (const { agent, result } of failed) {
    logger.warn(`  ${toDisplayName(agent)}: ${result}`);
  }

  if (copied.length === 0 && alreadyCopied.length === 0 && failed.length > 0) {
    if (skillOperation === "updated") {
      skillSpinner.warn("Skill files were updated, but agent copies could not be created.");
      return;
    }

    if (skillOperation === "installed") {
      skillSpinner.warn("Skill files were installed, but agent copies could not be created.");
      return;
    }

    logger.warn("Skill files are present, but agent copies could not be created.");
    return;
  }

  if (skillOperation === "current") {
    const version = formatSkillVersion(skillStatus.latestVersion ?? skillStatus.installedVersion);
    if (alreadyCopied.length > 0 && copied.length === 0) {
      logger.success(`Skill already installed (${version}) for ${alreadyCopied.join(", ")}.`);
      return;
    }
    if (copied.length > 0) {
      logger.success(`Skill already up to date (${version}). Copied it for ${copied.join(", ")}.`);
      return;
    }
    logger.success(`Skill already installed (${version}).`);
    return;
  }

  if (skillOperation === "unverified") {
    logger.warn("Could not verify whether the installed skill is the latest version.");
    if (alreadyCopied.length > 0 && copied.length === 0) {
      logger.success(`Skill already installed for ${alreadyCopied.join(", ")}.`);
      return;
    }
    if (copied.length > 0) {
      logger.success(`Skill already present. Copied it for ${copied.join(", ")}.`);
      return;
    }
    logger.success("Skill already installed.");
    return;
  }

  if (skillOperation === "updated") {
    if (copied.length > 0 || alreadyCopied.length > 0) {
      skillSpinner.succeed(`Skill updated for ${[...copied, ...alreadyCopied].join(", ")}.`);
      return;
    }
    skillSpinner.succeed("Skill updated.");
    return;
  }

  if (copied.length > 0) {
    skillSpinner.succeed(`Skill installed for ${copied.join(", ")}.`);
  } else if (alreadyCopied.length > 0) {
    skillSpinner.succeed(`Skill installed for ${alreadyCopied.join(", ")}.`);
  } else {
    skillSpinner.succeed("Skill installed.");
  }
};
