import { execFile } from "node:child_process";
import * as path from "node:path";
import { Effect, FileSystem } from "effect";
import { NodeServices } from "@effect/platform-node";
import {
  HEALTHCHECK_LINT_KEYWORDS,
  HEALTHCHECK_SCRIPT_TIMEOUT_MS,
  LOCK_FILE_TO_AGENT,
} from "../constants";

export interface ScriptResult {
  script: string;
  passed: boolean;
  output: string;
}

export interface PackageHealthResult {
  packageName: string;
  directory: string;
  results: ScriptResult[];
}

export interface HealthcheckPackageEntry {
  packageName: string;
  directory: string;
  scripts: string[];
}

export interface HealthcheckCallbacks {
  onPackageStart: (packageName: string, scripts: string[]) => void;
  onScriptDone: (packageName: string, result: ScriptResult) => void;
}

const WORKSPACE_GLOBS = ["packages/*", "apps/*"];

const isLintLikeScript = (scriptName: string): boolean =>
  HEALTHCHECK_LINT_KEYWORDS.some((keyword) => scriptName.includes(keyword));

const detectAgent = Effect.fn("detectAgent")(function* (rootDir: string) {
  const fileSystem = yield* FileSystem.FileSystem;

  for (const [lockFile, agent] of Object.entries(LOCK_FILE_TO_AGENT)) {
    const lockPath = path.join(rootDir, lockFile);
    const exists = yield* fileSystem
      .exists(lockPath)
      .pipe(Effect.catchTag("PlatformError", () => Effect.succeed(false)));
    if (exists) return agent;
  }

  const packageJsonPath = path.join(rootDir, "package.json");
  const content = yield* fileSystem
    .readFileString(packageJsonPath)
    .pipe(Effect.catchTag("PlatformError", () => Effect.succeed("")));

  if (content) {
    const parsed = yield* Effect.try({
      try: () => JSON.parse(content) as { packageManager?: string },
      catch: () => ({ _tag: "JsonParseError" as const }),
    }).pipe(Effect.catchTag("JsonParseError", () => Effect.succeed(undefined)));
    if (parsed?.packageManager) {
      const agentName = parsed.packageManager.split("@")[0];
      if (agentName) return agentName;
    }
  }

  return "npm";
});

const readPackageJson = Effect.fn("readPackageJson")(function* (directory: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const packageJsonPath = path.join(directory, "package.json");
  const content = yield* fileSystem.readFileString(packageJsonPath);
  return yield* Effect.try({
    try: () => JSON.parse(content) as { name?: string; scripts?: Record<string, string> },
    catch: () => ({ _tag: "JsonParseError" as const }),
  });
});

const listWorkspaceDirectories = Effect.fn("listWorkspaceDirectories")(function* (rootDir: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const directories: string[] = [];

  for (const glob of WORKSPACE_GLOBS) {
    const parentDir = path.join(rootDir, path.dirname(glob));
    const entries = yield* fileSystem
      .readDirectory(parentDir)
      .pipe(Effect.catchTag("PlatformError", () => Effect.succeed([] as string[])));

    for (const entry of entries) {
      const fullPath = path.join(parentDir, entry);
      const stat = yield* fileSystem
        .stat(fullPath)
        .pipe(Effect.catchTag("PlatformError", () => Effect.succeed(undefined)));
      if (stat?.type === "Directory") {
        directories.push(fullPath);
      }
    }
  }

  return directories;
});

const runScript = (agent: string, directory: string, script: string): Promise<ScriptResult> =>
  new Promise((resolve) => {
    execFile(
      agent,
      ["run", script],
      { cwd: directory, timeout: HEALTHCHECK_SCRIPT_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = (stdout + "\n" + stderr).trim();
        resolve({ script, passed: !error, output });
      },
    );
  });

const discoverPackages = Effect.fn("discoverPackages")(function* (rootDir: string) {
  const directories = yield* listWorkspaceDirectories(rootDir);
  const entries: HealthcheckPackageEntry[] = [];

  for (const directory of directories) {
    const packageJson = yield* readPackageJson(directory).pipe(
      Effect.catchTag("PlatformError", () => Effect.succeed(undefined)),
      Effect.catchTag("JsonParseError", () => Effect.succeed(undefined)),
    );

    if (!packageJson?.scripts) continue;

    const lintScripts = Object.keys(packageJson.scripts).filter(isLintLikeScript);
    if (lintScripts.length === 0) continue;

    entries.push({
      packageName: packageJson.name ?? path.basename(directory),
      directory,
      scripts: lintScripts,
    });
  }

  return entries;
});

export const runHealthcheck = async (
  rootDir: string,
  callbacks: HealthcheckCallbacks,
): Promise<PackageHealthResult[]> => {
  const effect = Effect.gen(function* () {
    const agent = yield* detectAgent(rootDir);
    const packages = yield* discoverPackages(rootDir);

    const results = yield* Effect.forEach(
      packages,
      (entry) =>
        Effect.gen(function* () {
          callbacks.onPackageStart(entry.packageName, entry.scripts);

          const scriptResults: ScriptResult[] = [];
          for (const script of entry.scripts) {
            const result = yield* Effect.promise(() => runScript(agent, entry.directory, script));
            callbacks.onScriptDone(entry.packageName, result);
            scriptResults.push(result);
          }

          return {
            packageName: entry.packageName,
            directory: entry.directory,
            results: scriptResults,
          } satisfies PackageHealthResult;
        }),
      { concurrency: 4 },
    );

    return results;
  });

  return Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
};
