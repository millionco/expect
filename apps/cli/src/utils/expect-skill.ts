import * as path from "node:path";
import { type SupportedAgent, toSkillDir } from "@expect/agent";
import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { SKILL_FETCH_TIMEOUT_MS } from "../constants";

export const AGENTS_SKILLS_DIR = ".agents/skills";
export const SKILL_NAME = "expect";
const SKILL_REPO = "millionco/expect";
const SKILL_BRANCH = "main";
export const SKILL_SOURCE_DIR = "packages/expect-skill";
export const SKILL_TARBALL_URL = `https://codeload.github.com/${SKILL_REPO}/tar.gz/${SKILL_BRANCH}`;
export const SKILL_RAW_URL = `https://raw.githubusercontent.com/${SKILL_REPO}/${SKILL_BRANCH}/${SKILL_SOURCE_DIR}/SKILL.md`;

export interface ExpectSkillStatus {
  installed: boolean;
  isLatest: boolean | undefined;
  installedVersion: string | undefined;
  latestVersion: string | undefined;
}

export class ExpectSkillReadError extends Schema.ErrorClass<ExpectSkillReadError>(
  "ExpectSkillReadError",
)({
  _tag: Schema.tag("ExpectSkillReadError"),
  installedSkillPath: Schema.String,
  reason: Schema.String,
}) {
  message = `Failed to read installed expect skill at ${this.installedSkillPath}: ${this.reason}`;
}

export class ExpectSkillFetchError extends Schema.ErrorClass<ExpectSkillFetchError>(
  "ExpectSkillFetchError",
)({
  _tag: Schema.tag("ExpectSkillFetchError"),
  url: Schema.String,
  reason: Schema.String,
}) {
  message = `Failed to fetch latest expect skill from ${this.url}: ${this.reason}`;
}

const SKILL_VERSION_PATTERN = /^ {2}version:\s*"([^"]+)"/m;

const readSkillVersion = (content: string | undefined): string | undefined => {
  if (content === undefined) return undefined;
  return content.match(SKILL_VERSION_PATTERN)?.[1];
};

export const formatSkillVersion = (version: string | undefined): string =>
  version === undefined ? "unknown version" : `v${version}`;

export const getInstalledSkillFilePath = (projectRoot: string): string =>
  path.join(projectRoot, AGENTS_SKILLS_DIR, SKILL_NAME, "SKILL.md");

export const readInstalledSkill = Effect.fn("Skill.readInstalledSkill")(function* (
  projectRoot: string,
) {
  const fileSystem = yield* FileSystem;
  const installedSkillPath = getInstalledSkillFilePath(projectRoot);

  return yield* fileSystem.readFileString(installedSkillPath).pipe(
    Effect.map((content): string | undefined => content),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
    Effect.catchTag("PlatformError", (cause) =>
      new ExpectSkillReadError({
        installedSkillPath,
        reason: cause.message,
      }).asEffect(),
    ),
  );
});

export const fetchLatestSkill = Effect.fn("Skill.fetchLatestSkill")(function* () {
  const response: Response = yield* Effect.tryPromise({
    try: () => fetch(SKILL_RAW_URL, { cache: "no-store" }),
    catch: (cause) =>
      new ExpectSkillFetchError({
        url: SKILL_RAW_URL,
        reason: String(cause),
      }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: SKILL_FETCH_TIMEOUT_MS,
      onTimeout: () =>
        new ExpectSkillFetchError({
          url: SKILL_RAW_URL,
          reason: "request timed out",
        }).asEffect(),
    }),
  );

  if (!response.ok) {
    return yield* new ExpectSkillFetchError({
      url: SKILL_RAW_URL,
      reason: `GitHub returned ${response.status}`,
    });
  }

  return yield* Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) =>
      new ExpectSkillFetchError({
        url: SKILL_RAW_URL,
        reason: String(cause),
      }),
  });
});

export const getExpectSkillStatus = Effect.fn("Skill.getExpectSkillStatus")(function* (
  projectRoot: string,
) {
  yield* Effect.annotateCurrentSpan({ projectRoot });

  const installedSkill = yield* readInstalledSkill(projectRoot).pipe(
    Effect.catchTag("ExpectSkillReadError", () => Effect.succeed(undefined)),
  );

  const latestSkill = yield* fetchLatestSkill().pipe(
    Effect.catchTag("ExpectSkillFetchError", () => Effect.succeed(undefined)),
  );

  return {
    installed: installedSkill !== undefined,
    isLatest:
      installedSkill !== undefined && latestSkill !== undefined
        ? installedSkill === latestSkill
        : undefined,
    installedVersion: readSkillVersion(installedSkill),
    latestVersion: readSkillVersion(latestSkill),
  };
});

export const detectInstalledSkillAgents = Effect.fn("Skill.detectInstalledSkillAgents")(function* (
  projectRoot: string,
  agents: readonly SupportedAgent[],
) {
  const fileSystem = yield* FileSystem;
  const results: SupportedAgent[] = [];
  for (const agent of agents) {
    const skillPath = path.join(projectRoot, toSkillDir(agent), SKILL_NAME);
    const exists = yield* fileSystem.access(skillPath).pipe(
      Effect.as(true),
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(false)),
      Effect.catchTag("PlatformError", () => Effect.succeed(false)),
    );
    if (exists) results.push(agent);
  }
  return results;
});

export const hasInstalledExpectSkill = Effect.fn("Skill.hasInstalledExpectSkill")(function* (
  projectRoot: string,
  agents: readonly SupportedAgent[],
) {
  const fileSystem = yield* FileSystem;
  const skillFilePath = getInstalledSkillFilePath(projectRoot);
  const mainSkillExists = yield* fileSystem.access(skillFilePath).pipe(
    Effect.as(true),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(false)),
    Effect.catchTag("PlatformError", () => Effect.succeed(false)),
  );
  if (mainSkillExists) return true;
  const installedAgents = yield* detectInstalledSkillAgents(projectRoot, agents);
  return installedAgents.length > 0;
});
