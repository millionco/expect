import { dirname, join } from "node:path";
import { Effect, Layer, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import type { PlatformError } from "effect/PlatformError";
import { NodeServices } from "@effect/platform-node";
import type { BrowserEnvironmentHints, BrowserFlowPlan, TestTarget } from "./types";
import {
  FLOW_DESCRIPTION_CHAR_LIMIT,
  FLOW_DIRECTORY_INDEX_FILE_NAME,
  SAVED_FLOW_FORMAT_VERSION,
} from "./constants";
import { getSavedFlowDirectoryPath } from "./utils/get-saved-flow-directory-path";
import {
  formatSavedFlowFrontmatter,
  parseSavedFlowFile,
  type SavedFlowFileData,
} from "./saved-flow-file";
import { slugify } from "./utils/slugify";
import { FlowNotFoundError, FlowParseError, FlowStorageError } from "./flow-storage-errors";

export interface SaveFlowOptions {
  target: TestTarget;
  plan: BrowserFlowPlan;
  environment: BrowserEnvironmentHints;
}

export interface SaveFlowResult {
  flowPath: string;
  directoryPath: string;
  slug: string;
}

export interface SavedFlowSummary {
  title: string;
  description: string;
  slug: string;
  filePath: string;
  modifiedAtMs: number;
  savedTargetScope: TestTarget["scope"] | null;
  savedTargetDisplayName: string | null;
}

export interface LoadedSavedFlow extends SavedFlowSummary {
  plan: BrowserFlowPlan;
  environment: BrowserEnvironmentHints;
}

interface SavedFlowDirectoryEntry {
  title: string;
  description: string;
  slug: string;
}

const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/g, " ");

const truncateDescription = (value: string, limit: number): string => {
  const cleaned = normalizeWhitespace(value);
  if (cleaned.length <= limit) return cleaned;
  return cleaned.slice(0, limit - 1) + "…";
};

const createFlowDescription = (plan: BrowserFlowPlan): string =>
  truncateDescription(
    plan.targetSummary || plan.rationale || plan.userInstruction,
    FLOW_DESCRIPTION_CHAR_LIMIT,
  );

const formatOptionalList = (values: string[]): string =>
  values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- None";

const formatFlowFileContent = (
  options: SaveFlowOptions,
  slug: string,
  description: string,
): string => {
  const { target, plan, environment } = options;

  const stepBlocks = plan.steps
    .map((step, index) =>
      [
        `### ${index + 1}. ${step.title}`,
        "",
        `Instruction: ${step.instruction}`,
        `Expected outcome: ${step.expectedOutcome}`,
        `Route hint: ${step.routeHint ?? "None"}`,
        `Changed file evidence: ${
          step.changedFileEvidence && step.changedFileEvidence.length > 0
            ? step.changedFileEvidence.join(", ")
            : "None"
        }`,
      ].join("\n"),
    )
    .join("\n\n");

  return [
    formatSavedFlowFrontmatter({
      format_version: SAVED_FLOW_FORMAT_VERSION,
      title: plan.title,
      description,
      slug,
      saved_target_scope: target.scope,
      saved_target_display_name: target.displayName,
      plan,
      environment,
    }),
    "",
    `# ${plan.title}`,
    "",
    description,
    "",
    "## User Instruction",
    "",
    plan.userInstruction,
    "",
    "## Target",
    "",
    `- Scope: ${target.scope}`,
    `- Display name: ${target.displayName}`,
    `- Current branch: ${target.branch.current}`,
    `- Main branch: ${target.branch.main ?? "unknown"}`,
    "",
    "## Cookie Sync",
    "",
    `- Required: ${plan.cookieSync.required ? "Yes" : "No"}`,
    `- Reason: ${plan.cookieSync.reason}`,
    `- Enabled for this saved flow: ${environment.cookies === true ? "Yes" : "No"}`,
    "",
    "## Target URLs",
    "",
    formatOptionalList(plan.targetUrls),
    "",
    "## Risk Areas",
    "",
    formatOptionalList(plan.riskAreas),
    "",
    "## Assumptions",
    "",
    formatOptionalList(plan.assumptions),
    "",
    "## Steps",
    "",
    stepBlocks,
    "",
  ].join("\n");
};

const getSavedFlowSummary = (
  savedFlowFileData: SavedFlowFileData,
  filePath: string,
  modifiedAtMs: number,
): SavedFlowSummary => ({
  title: savedFlowFileData.title,
  description: savedFlowFileData.description,
  slug: savedFlowFileData.slug,
  filePath,
  modifiedAtMs,
  savedTargetScope: savedFlowFileData.saved_target_scope,
  savedTargetDisplayName: savedFlowFileData.saved_target_display_name,
});

const getSavedFlowDirectoryEntry = (
  savedFlowFileData: SavedFlowFileData,
): SavedFlowDirectoryEntry => ({
  title: savedFlowFileData.title,
  description: savedFlowFileData.description,
  slug: savedFlowFileData.slug,
});

const formatSavedFlowDirectoryContent = (entries: SavedFlowDirectoryEntry[]): string =>
  [
    "# Saved Flows",
    "",
    ...(entries.length > 0
      ? entries.map((entry) => `- [${entry.title}](./${entry.slug}.md) - ${entry.description}`)
      : ["No saved flows yet."]),
    "",
  ].join("\n");

const filterFlowFileNames = (fileNames: string[]): string[] =>
  fileNames
    .filter((fileName) => fileName.endsWith(".md") && fileName !== FLOW_DIRECTORY_INDEX_FILE_NAME)
    .sort((leftValue, rightValue) => leftValue.localeCompare(rightValue));

const getModifiedAtMs = (modifiedAt: unknown): number => {
  if (modifiedAt === undefined || modifiedAt === null) return 0;
  if (typeof modifiedAt === "number") return modifiedAt;
  if (typeof modifiedAt === "bigint") return Number(modifiedAt);
  if (modifiedAt instanceof Date) return modifiedAt.getTime();
  return 0;
};
const EMPTY_FLOW_FILE_NAMES: string[] = [];

export class FlowStorage extends ServiceMap.Service<FlowStorage>()("@supervisor/FlowStorage", {
  make: Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    const withStorageError = <A, E, R>(
      effect: Effect.Effect<A, E | PlatformError, R>,
      operation: string,
      filePath: string,
    ) =>
      effect.pipe(
        Effect.catchTag("PlatformError", (cause) =>
          new FlowStorageError({ operation, filePath, cause }).asEffect(),
        ),
      );

    const readFlowFile = Effect.fn("FlowStorage.readFlowFile")(function* (filePath: string) {
      const fileContent = yield* fileSystem.readFileString(filePath).pipe(
        Effect.catchReason("PlatformError", "NotFound", () =>
          new FlowNotFoundError({ lookupType: "filePath", lookupValue: filePath }).asEffect(),
        ),
        (effect) => withStorageError(effect, "read saved flow file", filePath),
      );

      const fileInfo = yield* fileSystem.stat(filePath).pipe(
        Effect.catchReason("PlatformError", "NotFound", () =>
          new FlowNotFoundError({ lookupType: "filePath", lookupValue: filePath }).asEffect(),
        ),
        (effect) => withStorageError(effect, "stat saved flow file", filePath),
      );

      const savedFlowFileData = parseSavedFlowFile(fileContent);
      if (!savedFlowFileData) {
        return yield* new FlowParseError({ filePath }).asEffect();
      }

      return {
        savedFlowFileData,
        modifiedAtMs: getModifiedAtMs(fileInfo.mtime),
      };
    });

    const readFlowFileNames = Effect.fn("FlowStorage.readFlowFileNames")(function* (
      flowDirectoryPath: string,
    ) {
      return yield* fileSystem.readDirectory(flowDirectoryPath).pipe(
        Effect.map(filterFlowFileNames),
        Effect.catchReason("PlatformError", "NotFound", () =>
          Effect.succeed(EMPTY_FLOW_FILE_NAMES),
        ),
        (effect) => withStorageError(effect, "read saved flow directory", flowDirectoryPath),
      );
    });

    const syncDirectory = Effect.fn("FlowStorage.syncDirectory")(function* (
      flowDirectoryPath: string,
    ) {
      const directoryFilePath = join(flowDirectoryPath, FLOW_DIRECTORY_INDEX_FILE_NAME);
      const flowFileNames = yield* readFlowFileNames(flowDirectoryPath);
      const directoryEntries = yield* Effect.forEach(
        flowFileNames,
        (fileName) =>
          readFlowFile(join(flowDirectoryPath, fileName)).pipe(
            Effect.map(({ savedFlowFileData }) => getSavedFlowDirectoryEntry(savedFlowFileData)),
            Effect.catchTags({
              FlowNotFoundError: () => Effect.succeed(undefined),
              FlowParseError: () => Effect.succeed(undefined),
              FlowStorageError: () => Effect.succeed(undefined),
            }),
          ),
        { concurrency: "unbounded" },
      );

      const filteredEntries = directoryEntries
        .filter((entry): entry is SavedFlowDirectoryEntry => entry !== undefined)
        .sort((leftValue, rightValue) => leftValue.title.localeCompare(rightValue.title));

      yield* fileSystem
        .writeFileString(directoryFilePath, formatSavedFlowDirectoryContent(filteredEntries))
        .pipe((effect) =>
          withStorageError(effect, "write saved flow directory", directoryFilePath),
        );

      return directoryFilePath;
    });

    const save = Effect.fn("FlowStorage.save")(function* (options: SaveFlowOptions) {
      const slug = slugify(options.plan.title);
      const description = createFlowDescription(options.plan);
      const flowDirectoryPath = getSavedFlowDirectoryPath(options.target.cwd);
      const flowFilePath = join(flowDirectoryPath, `${slug}.md`);

      yield* fileSystem
        .makeDirectory(flowDirectoryPath, { recursive: true })
        .pipe((effect) =>
          withStorageError(effect, "create saved flow directory", flowDirectoryPath),
        );
      yield* fileSystem
        .writeFileString(flowFilePath, formatFlowFileContent(options, slug, description))
        .pipe((effect) => withStorageError(effect, "write saved flow file", flowFilePath));
      yield* syncDirectory(flowDirectoryPath);

      return {
        flowPath: flowFilePath,
        directoryPath: join(flowDirectoryPath, FLOW_DIRECTORY_INDEX_FILE_NAME),
        slug,
      };
    });

    const load = Effect.fn("FlowStorage.load")(function* (filePath: string) {
      const { savedFlowFileData, modifiedAtMs } = yield* readFlowFile(filePath);

      return {
        ...getSavedFlowSummary(savedFlowFileData, filePath, modifiedAtMs),
        environment: savedFlowFileData.environment,
        plan: savedFlowFileData.plan,
      };
    });

    const list = Effect.fn("FlowStorage.list")(function* (cwd: string = process.cwd()) {
      const flowDirectoryPath = getSavedFlowDirectoryPath(cwd);
      const flowFileNames = yield* readFlowFileNames(flowDirectoryPath);

      const savedFlows = yield* Effect.forEach(
        flowFileNames,
        (fileName) =>
          readFlowFile(join(flowDirectoryPath, fileName)).pipe(
            Effect.map(({ savedFlowFileData, modifiedAtMs }) =>
              getSavedFlowSummary(
                savedFlowFileData,
                join(flowDirectoryPath, fileName),
                modifiedAtMs,
              ),
            ),
            Effect.catchTags({
              FlowNotFoundError: () => Effect.succeed(undefined),
              FlowParseError: () => Effect.succeed(undefined),
              FlowStorageError: () => Effect.succeed(undefined),
            }),
          ),
        { concurrency: "unbounded" },
      );

      return savedFlows
        .filter((savedFlow): savedFlow is SavedFlowSummary => savedFlow !== undefined)
        .sort(
          (leftValue, rightValue) =>
            rightValue.modifiedAtMs - leftValue.modifiedAtMs ||
            leftValue.title.localeCompare(rightValue.title),
        );
    });

    const loadBySlug = Effect.fn("FlowStorage.loadBySlug")(function* (
      slug: string,
      cwd: string = process.cwd(),
    ) {
      const savedFlows = yield* list(cwd);
      const matchingFlow = savedFlows.find((flow) => flow.slug === slug);

      if (!matchingFlow) {
        return yield* new FlowNotFoundError({ lookupType: "slug", lookupValue: slug }).asEffect();
      }

      return yield* load(matchingFlow.filePath);
    });

    const remove = Effect.fn("FlowStorage.remove")(function* (filePath: string) {
      yield* fileSystem.remove(filePath).pipe(
        Effect.catchReason("PlatformError", "NotFound", () =>
          new FlowNotFoundError({ lookupType: "filePath", lookupValue: filePath }).asEffect(),
        ),
        (effect) => withStorageError(effect, "remove saved flow file", filePath),
      );
      yield* syncDirectory(dirname(filePath));
    });

    return { save, load, loadBySlug, list, remove } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make).pipe(Layer.provide(NodeServices.layer));
}

export const saveFlow = (options: SaveFlowOptions) =>
  FlowStorage.use((flowStorage) => flowStorage.save(options));

export const loadSavedFlow = (filePath: string) =>
  FlowStorage.use((flowStorage) => flowStorage.load(filePath));

export const loadSavedFlowBySlug = (slug: string, cwd?: string) =>
  FlowStorage.use((flowStorage) => flowStorage.loadBySlug(slug, cwd));

export const listSavedFlows = (cwd?: string) =>
  FlowStorage.use((flowStorage) => flowStorage.list(cwd));

export const removeSavedFlow = (filePath: string) =>
  FlowStorage.use((flowStorage) => flowStorage.remove(filePath));
