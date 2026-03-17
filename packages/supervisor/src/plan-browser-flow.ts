import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentProviderSettings } from "@browser-tester/agent";
import { Effect, Result, Schema } from "effect";
import {
  BROWSER_TEST_MODEL,
  CODEX_PLANNER_MODEL,
  DEFAULT_AGENT_PROVIDER,
  PLANNER_CHANGED_FILE_LIMIT,
  PLANNER_MAX_STEP_COUNT,
  PLANNER_MAX_TURNS,
  PLANNER_MODEL_EFFORT,
  PLANNER_RECENT_COMMIT_LIMIT,
  STEP_ID_PAD_LENGTH,
} from "./constants.js";
import { createAgentModel } from "./create-agent-model.js";
import { PlanParseError, PlanningError } from "./errors.js";
import { extractJsonObject } from "./json.js";
import type { PlanBrowserFlowOptions, PlanStep, TestTarget } from "./types.js";
import { detectAuthError } from "./utils/detect-auth-error.js";
import { formatDiffStats } from "./utils/format-diff-stats.js";
import { prioritizePlanningFiles } from "./utils/prioritize-planning-files.js";
import { resolveAgentProvider } from "./utils/resolve-agent-provider.js";

const NullableOptionalStringSchema = Schema.optional(Schema.NullOr(Schema.NonEmptyString));

const PlanStepSchema = Schema.Struct({
  id: NullableOptionalStringSchema,
  title: Schema.NonEmptyString,
  instruction: Schema.NonEmptyString,
  expectedOutcome: Schema.NonEmptyString,
  routeHint: NullableOptionalStringSchema,
  changedFileEvidence: Schema.optional(Schema.Array(Schema.NonEmptyString)),
});

const BrowserFlowPlanSchema = Schema.Struct({
  title: Schema.NonEmptyString,
  rationale: Schema.NonEmptyString,
  targetSummary: Schema.NonEmptyString,
  assumptions: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  riskAreas: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  targetUrls: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  cookieSync: Schema.Struct({
    required: Schema.Boolean,
    reason: Schema.NonEmptyString,
  }),
  steps: Schema.Array(PlanStepSchema),
});

export const buildPlannerModelSettings = (
  options: Pick<PlanBrowserFlowOptions, "provider" | "providerSettings" | "target">,
): AgentProviderSettings => {
  const provider = options.provider ?? DEFAULT_AGENT_PROVIDER;
  const providerSpecificSettings: Record<string, unknown> =
    provider === "claude"
      ? { model: BROWSER_TEST_MODEL, permissionMode: "plan" as const }
      : provider === "codex"
        ? { model: CODEX_PLANNER_MODEL }
        : {};

  return {
    cwd: options.target.cwd,
    effort: PLANNER_MODEL_EFFORT,
    maxTurns: PLANNER_MAX_TURNS,
    ...providerSpecificSettings,
    ...(options.providerSettings ?? {}),
  };
};

const buildDiffRetrievalCommand = (target: TestTarget): string => {
  if (target.scope === "commit" && target.selectedCommit) {
    return `git show ${target.selectedCommit.shortHash} -- <filepath>`;
  }

  if (target.scope === "branch" && target.branch.main) {
    return `git diff ${target.branch.main}...HEAD -- <filepath>`;
  }

  if (target.scope === "changes" && target.branch.main) {
    return `git diff ${target.branch.main} -- <filepath>`;
  }

  return "git diff -- <filepath>";
};

const formatScopePlanningStrategy = (target: TestTarget): string => {
  if (target.scope === "unstaged") {
    return [
      "- Target mode: unstaged",
      "- Bias toward fast smoke coverage of the touched surfaces.",
      "- Prefer the smallest set of steps that still checks each changed user-facing surface.",
      "- Cover the direct change and only the most obvious adjacent flow if it materially de-risks the diff.",
      "- Avoid broad regression sweeps unless a retrieved diff clearly suggests a cross-cutting change.",
    ].join("\n");
  }

  if (target.scope === "commit") {
    return [
      "- Target mode: commit",
      "- Bias toward narrow validation of the specific change in the selected commit.",
      `- Selected commit: ${target.selectedCommit?.shortHash ?? "unknown"} ${
        target.selectedCommit?.subject ?? ""
      }`.trim(),
      "- Treat the commit subject and diff as the primary testing hypothesis.",
      "- Prefer a focused before/after validation instead of a broad end-to-end tour.",
    ].join("\n");
  }

  if (target.scope === "changes") {
    return [
      "- Target mode: changes (all changes from main, committed + uncommitted)",
      "- Treat committed branch changes and uncommitted working-tree changes as one body of work.",
      "- Bias toward coverage of the full changeset — both committed and in-progress changes matter equally.",
      "- Cover the direct journey plus the most obvious adjacent flows that could regress.",
      "- Prioritize the highest-risk browser journeys over exhaustive coverage.",
    ].join("\n");
  }

  return [
    "- Target mode: branch",
    "- Bias toward broader regression around neighboring flows touched by the branch diff.",
    "- Cover the direct journey plus adjacent entry points or follow-up screens that could regress together.",
    "- Include a wider sanity pass when multiple related product files changed.",
    "- Still prioritize the highest-risk browser journeys over exhaustive coverage.",
  ].join("\n");
};

const buildPlanningPrompt = (options: PlanBrowserFlowOptions): string => {
  const { target, userInstruction, environment } = options;
  const prioritizedFiles = prioritizePlanningFiles(target.changedFiles);
  const displayedFiles = prioritizedFiles.slice(0, PLANNER_CHANGED_FILE_LIMIT);

  return [
    "You are planning a browser-based regression test flow for a developer.",
    "Return JSON only and make the plan directly editable by a human reviewer.",
    "",
    "Testing target:",
    `- Scope: ${target.scope}`,
    `- Display name: ${target.displayName}`,
    `- Current branch: ${target.branch.current}`,
    `- Main branch: ${target.branch.main ?? "unknown"}`,
    `- Diff stats: ${formatDiffStats(target.diffStats)}`,
    target.selectedCommit
      ? `- Selected commit: ${target.selectedCommit.shortHash} ${target.selectedCommit.subject}`
      : null,
    "",
    "Changed files:",
    displayedFiles.length > 0
      ? displayedFiles.map((file) => `- [${file.status}] ${file.path}`).join("\n")
      : "- No changed files detected",
    "",
    "Recent commits:",
    target.recentCommits.length > 0
      ? target.recentCommits
          .slice(0, PLANNER_RECENT_COMMIT_LIMIT)
          .map((commit) => `- ${commit.shortHash} ${commit.subject}`)
          .join("\n")
      : "- No recent commits available",
    "",
    "Retrieving diffs:",
    "- Do NOT retrieve all diffs at once. Inspect only the 2-3 files most relevant to the testing journey.",
    `- To view a file's diff, run: ${buildDiffRetrievalCommand(target)}`,
    "- Start with the highest-signal files (UI components, routes, pages), then decide if more context is needed.",
    "- Stop retrieving once you have enough information to write a confident plan.",
    "",
    "User-requested browser journey:",
    userInstruction,
    "",
    "Environment hints:",
    `- Base URL: ${environment?.baseUrl ?? "not provided"}`,
    `- Headed mode: ${environment?.headed === true ? "yes" : "no or not specified"}`,
    `- Reuse browser cookies: ${environment?.cookies === true ? "yes" : "no or not specified"}`,
    "",
    "Scope strategy:",
    formatScopePlanningStrategy(target),
    "",
    "Requirements:",
    "- Make the plan meaningfully different depending on whether the target is unstaged, changes, branch, or commit.",
    "- Blend the requested journey with code-change-derived risk areas.",
    "- Focus on realistic browser steps that a browser agent can execute.",
    "- Use each step's expectedOutcome as a concrete browser assertion target, not just a vague goal.",
    "- Include assumptions when the journey depends on unknown data or authentication.",
    "- Decide whether syncing browser cookies is required to execute the flow reliably.",
    "- Set cookieSync.required to true when the flow likely needs an authenticated user session, account state, org access, or non-public app data.",
    "- Set cookieSync.required to false for public or clearly unauthenticated flows, and explain the decision in cookieSync.reason.",
    "- Before returning, self-check the plan by asking: Which risk area is not covered by any step? Which step is likely to fail due to auth or missing data?",
    "- Use that self-check to strengthen the steps, assumptions, riskAreas, and cookieSync decision before you return the final JSON.",
    "- Keep the plan concise and high signal.",
    `- Use a maximum of ${PLANNER_MAX_STEP_COUNT} steps.`,
    "",
    "Return a JSON object with this exact shape:",
    '{"title":"string","rationale":"string","targetSummary":"string","assumptions":["string"],"riskAreas":["string"],"targetUrls":["string"],"cookieSync":{"required":true,"reason":"string"},"steps":[{"id":"optional string","title":"string","instruction":"string","expectedOutcome":"string","routeHint":"optional string","changedFileEvidence":["string"]}]}',
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
};

const findPlanCandidate = (parsedJson: unknown): unknown => {
  const looksLikePlan = (value: unknown): value is Record<string, unknown> =>
    Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ("title" in value || "steps" in value || "cookieSync" in value),
    );

  if (looksLikePlan(parsedJson)) return parsedJson;
  if (!parsedJson || typeof parsedJson !== "object" || Array.isArray(parsedJson)) return parsedJson;

  for (const value of Object.values(parsedJson)) {
    if (looksLikePlan(value)) return value;
  }

  return parsedJson;
};

interface PlannerModelFailure {
  cause: unknown;
  authMessage?: string;
}

const generatePlanResponse = Effect.fn("generatePlanResponse")(function* (
  options: PlanBrowserFlowOptions,
  prompt: string,
  provider: NonNullable<PlanBrowserFlowOptions["provider"]>,
) {
  const model: LanguageModelV3 =
    options.model ??
    createAgentModel(provider, buildPlannerModelSettings({ ...options, provider }));

  return yield* Effect.tryPromise({
    try: () =>
      model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      }),
    catch: (cause) =>
      ({
        cause,
        authMessage: detectAuthError(provider, cause),
      }) satisfies PlannerModelFailure,
  });
});

const resolvePlanningResponse = Effect.fn("resolvePlanningResponse")(function* (
  options: PlanBrowserFlowOptions,
  prompt: string,
) {
  if (options.model) {
    return yield* generatePlanResponse(
      options,
      prompt,
      options.provider ?? DEFAULT_AGENT_PROVIDER,
    ).pipe(
      Effect.mapError(
        (failure) =>
          new PlanningError({
            stage: "model generation",
            cause: failure.authMessage ?? failure.cause,
          }),
      ),
    );
  }

  const resolvedAgentProvider = yield* resolveAgentProvider(options.provider).pipe(
    Effect.mapError((cause) => new PlanningError({ stage: "agent selection", cause })),
  );
  const providersToTry = [
    resolvedAgentProvider.provider,
    ...resolvedAgentProvider.fallbackProviders,
  ] as const;

  for (const [providerIndex, provider] of providersToTry.entries()) {
    const attempt = yield* Effect.result(generatePlanResponse(options, prompt, provider));

    if (Result.isSuccess(attempt)) {
      return attempt.success;
    }

    const isLastProvider = providerIndex === providersToTry.length - 1;

    if (
      resolvedAgentProvider.explicit ||
      attempt.failure.authMessage === undefined ||
      isLastProvider
    ) {
      return yield* new PlanningError({
        stage: "model generation",
        cause: attempt.failure.authMessage ?? attempt.failure.cause,
      }).asEffect();
    }
  }

  return yield* new PlanningError({
    stage: "model generation",
    cause: "No available planning agent could complete the request.",
  }).asEffect();
});

export const planBrowserFlow = Effect.fn("planBrowserFlow")(function* (
  options: PlanBrowserFlowOptions,
) {
  yield* Effect.annotateCurrentSpan({
    cwd: options.target.cwd,
    scope: options.target.scope,
  });

  const prompt = buildPlanningPrompt(options);
  const response = yield* resolvePlanningResponse(options, prompt);

  const text = response.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");

  const parsedJson = yield* Effect.try({
    try: () => JSON.parse(extractJsonObject(text)),
    catch: (cause) => new PlanParseError({ stage: "json extraction", cause }),
  });

  const parsedPlan = yield* Schema.decodeUnknownEffect(BrowserFlowPlanSchema)(
    findPlanCandidate(parsedJson),
  ).pipe(Effect.mapError((cause) => new PlanParseError({ stage: "schema decode", cause })));

  if (parsedPlan.steps.length === 0 || parsedPlan.steps.length > PLANNER_MAX_STEP_COUNT) {
    return yield* new PlanParseError({
      stage: "schema decode",
      cause: `Expected between 1 and ${PLANNER_MAX_STEP_COUNT} steps.`,
    }).asEffect();
  }

  return {
    ...parsedPlan,
    assumptions: [...(parsedPlan.assumptions ?? [])],
    riskAreas: [...(parsedPlan.riskAreas ?? [])],
    targetUrls: [...(parsedPlan.targetUrls ?? [])],
    userInstruction: options.userInstruction,
    steps: parsedPlan.steps.map((step, index) => ({
      ...step,
      id: step.id ?? `step-${String(index + 1).padStart(STEP_ID_PAD_LENGTH, "0")}`,
      routeHint: step.routeHint ?? undefined,
      changedFileEvidence: [...(step.changedFileEvidence ?? [])],
    })) satisfies PlanStep[],
  };
});
