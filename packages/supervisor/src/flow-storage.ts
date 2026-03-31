import { Effect, FileSystem, Layer, Option, ServiceMap } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as path from "node:path";
import { type TestPlan, changesForDisplayName } from "@expect/shared/models";
import { formatSavedFlowFile, parseSavedFlowFile } from "./saved-flow-file";
import type { SavedFlowFileData } from "./types";
import {
  FLOW_DIRECTORY_NAME,
  FLOW_DESCRIPTION_CHAR_LIMIT,
  SAVED_FLOW_FORMAT_VERSION,
} from "./constants";
import { ensureStateDir } from "./utils/ensure-state-dir";
import { GitRepoRoot } from "./git/git";

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");

const testPlanToSavedFlowFileData = (plan: TestPlan): SavedFlowFileData => ({
  formatVersion: SAVED_FLOW_FORMAT_VERSION,
  title: plan.title,
  description: plan.instruction.slice(0, FLOW_DESCRIPTION_CHAR_LIMIT),
  slug: slugify(plan.title),
  savedTargetScope: plan.changesFor._tag,
  savedTargetDisplayName: changesForDisplayName(plan.changesFor),
  flow: {
    title: plan.title,
    userInstruction: plan.instruction,
    steps: plan.steps.map((step) => {
      const summaryText = Option.getOrElse(step.summary, () => "");
      return {
        id: step.id,
        title: step.title,
        instruction: step.instruction !== step.title ? step.instruction : summaryText || step.title,
        expectedOutcome: step.expectedOutcome || summaryText,
      };
    }),
  },
  environment: {
    baseUrl: Option.getOrElse(plan.baseUrl, () => ""),
    cookies: plan.requiresCookies,
  },
});

export class FlowStorage extends ServiceMap.Service<FlowStorage>()("@supervisor/FlowStorage", {
  make: Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    const getFlowsDirectory = Effect.gen(function* () {
      const repoRoot = yield* GitRepoRoot;
      const stateDir = yield* ensureStateDir(fileSystem, repoRoot);
      return path.join(stateDir, FLOW_DIRECTORY_NAME);
    });

    const save = Effect.fn("FlowStorage.save")(function* (plan: TestPlan) {
      const flowData = testPlanToSavedFlowFileData(plan);
      const flowsDir = yield* getFlowsDirectory;
      const filePath = path.join(flowsDir, `${flowData.slug}.md`);

      yield* fileSystem
        .makeDirectory(flowsDir, { recursive: true })
        .pipe(Effect.catchTag("PlatformError", () => Effect.void));

      yield* fileSystem.writeFileString(filePath, formatSavedFlowFile(flowData));

      yield* Effect.logInfo("Flow saved", {
        slug: flowData.slug,
        stepCount: flowData.flow.steps.length,
        filePath,
      });

      return flowData;
    });

    const list = Effect.fn("FlowStorage.list")(function* () {
      const flowsDir = yield* getFlowsDirectory;

      const exists = yield* fileSystem
        .exists(flowsDir)
        .pipe(Effect.catchTag("PlatformError", () => Effect.succeed(false)));
      if (!exists) return [] as SavedFlowFileData[];

      const entries = yield* fileSystem
        .readDirectory(flowsDir)
        .pipe(Effect.catchTag("PlatformError", () => Effect.succeed([] as string[])));

      const flowFiles = entries.filter((entry) => entry.endsWith(".md"));
      const flows: SavedFlowFileData[] = [];

      for (const fileName of flowFiles) {
        const content = yield* fileSystem
          .readFileString(path.join(flowsDir, fileName))
          .pipe(Effect.catchTag("PlatformError", () => Effect.succeed("")));
        if (!content) continue;

        const parsed = yield* Effect.try({
          try: () => parseSavedFlowFile(content),
          catch: () => ({ _tag: "FlowParseError" as const }),
        }).pipe(Effect.catchTag("FlowParseError", () => Effect.succeed(undefined)));
        if (parsed) flows.push(parsed);
      }

      yield* Effect.logDebug("Flows listed", { count: flows.length });

      return flows;
    });

    return { save, list } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
