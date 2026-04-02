import { DateTime, Effect, Option, Stream } from "effect";
import {
  ChangesFor,
  ExecutedTestPlan,
  PlanId,
  type StepId,
  type TestPlanStep,
} from "@expect/shared/models";
import { Executor } from "@expect/supervisor";
import type {
  ExpectChain,
  ExpectConfig,
  ExpectResult,
  ExpectTarget,
  PlaywrightPage,
  Requirement,
  StepResult,
  ToPassOptions,
} from "./types";
import { DEFAULT_TIMEOUT_MS, DEFAULT_AGENT_BACKEND } from "./constants";
import { getGlobalConfig } from "./config";
import { layerNodeApi } from "./layers";
import { buildInstruction, resolveUrl } from "./build-instruction";
import { ExpectTimeoutError } from "./errors";

const isPlaywrightPage = (target: unknown): target is PlaywrightPage =>
  typeof target === "object" &&
  target !== null &&
  "url" in target &&
  typeof (target as PlaywrightPage).url === "function" &&
  "goto" in target &&
  typeof (target as PlaywrightPage).goto === "function";

// HACK: `as` cast unavoidable — Array.isArray doesn't narrow `readonly T[]` unions in TypeScript
const normalizeRequirements = (
  requirements: Requirement | readonly Requirement[],
): readonly Requirement[] =>
  Array.isArray(requirements)
    ? (requirements as readonly Requirement[])
    : [requirements as Requirement];

const getRequirementText = (requirement: Requirement): string =>
  typeof requirement === "string" ? requirement : requirement.requirement;

const getStepElapsedMs = (step: TestPlanStep): number => {
  if (Option.isNone(step.startedAt) || Option.isNone(step.endedAt)) return 0;
  return Number(
    DateTime.toEpochMillis(step.endedAt.value) -
      DateTime.toEpochMillis(step.startedAt.value),
  );
};

const emptyExecutedPlan = (instruction: string, isHeadless: boolean, rationale: string) =>
  new ExecutedTestPlan({
    id: PlanId.makeUnsafe(crypto.randomUUID()),
    changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
    currentBranch: "",
    diffPreview: "",
    fileStats: [],
    instruction,
    baseUrl: Option.none(),
    isHeadless,
    cookieBrowserKeys: [],
    testCoverage: Option.none(),
    title: instruction,
    rationale,
    steps: [],
    events: [],
  });

const buildExpectResult = (
  url: string,
  requirements: readonly Requirement[],
  executed: ExecutedTestPlan,
  startedAt: number,
): ExpectResult => {
  const stepStatuses = new Map<
    StepId,
    { status: "passed" | "failed" | "skipped"; summary: string }
  >();

  for (const event of executed.events) {
    if (event._tag === "StepCompleted") {
      stepStatuses.set(event.stepId, { status: "passed", summary: event.summary });
    } else if (event._tag === "StepFailed") {
      stepStatuses.set(event.stepId, { status: "failed", summary: event.message });
    } else if (event._tag === "StepSkipped") {
      stepStatuses.set(event.stepId, { status: "skipped", summary: event.reason });
    }
  }

  const steps: StepResult[] = executed.steps.map((step) => {
    const entry = stepStatuses.get(step.id);
    const matchingRequirement = requirements.find(
      (requirement) => getRequirementText(requirement) === step.title,
    );
    return {
      requirement: matchingRequirement
        ? getRequirementText(matchingRequirement)
        : step.title,
      status: entry?.status ?? "skipped",
      summary: entry?.summary ?? "",
      duration: getStepElapsedMs(step),
    };
  });

  const screenshotPaths = executed.events
    .filter(
      (event) =>
        event._tag === "ToolResult" &&
        event.toolName.endsWith("__screenshot") &&
        !event.isError,
    )
    .map((event) => (event._tag === "ToolResult" ? event.result : ""))
    .filter(Boolean);

  if (steps.length > 0 && screenshotPaths.length > 0) {
    const lastScreenshot = screenshotPaths.at(-1);
    if (lastScreenshot) {
      const lastStep = steps[steps.length - 1];
      if (lastStep && !lastStep.screenshotPath) {
        steps[steps.length - 1] = { ...lastStep, screenshotPath: lastScreenshot };
      }
    }
  }

  const hasFailure = steps.some((step) => step.status === "failed");

  return {
    isPassed: !hasFailure && steps.length > 0,
    url,
    duration: Date.now() - startedAt,
    steps,
  };
};

const executeToPass = Effect.fn("expect.toPass")(function* (
  resolvedUrl: string,
  targetData: string | Record<string, unknown> | undefined,
  requirements: readonly Requirement[],
  options: ToPassOptions | undefined,
  config: Partial<ExpectConfig>,
) {
  yield* Effect.annotateCurrentSpan({ url: resolvedUrl, requirementCount: requirements.length });

  const executor = yield* Executor;
  const cookieBrowserKeys: string[] = [];
  const cookieOption = options?.cookies ?? config.cookies;
  if (cookieOption) {
    const cookieKey = typeof cookieOption === "string" ? cookieOption : cookieOption.source;
    cookieBrowserKeys.push(cookieKey);
  }

  const instruction = buildInstruction(resolvedUrl, targetData, requirements);
  const isHeadless = options?.isHeaded !== undefined
    ? !options.isHeaded
    : (config.isHeadless ?? true);

  yield* Effect.logInfo("expect.toPass starting", {
    url: resolvedUrl,
    requirementCount: requirements.length,
    isHeadless,
  });

  const startedAt = Date.now();

  const executeStream = executor
    .execute({
      changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
      instruction,
      isHeadless,
      cookieBrowserKeys,
      baseUrl: resolvedUrl,
    })
    .pipe(
      Stream.runLast,
      Effect.map((lastOption) =>
        Option.getOrElse(
          lastOption,
          () => emptyExecutedPlan(instruction, isHeadless, "Node API execution"),
        )
          .finalizeTextBlock()
          .synthesizeRunFinished(),
      ),
    );

  const timeoutMs = options?.timeout ?? config.timeout ?? DEFAULT_TIMEOUT_MS;
  const executeWithTimeout = executeStream.pipe(
    Effect.timeoutOrElse({
      duration: `${timeoutMs} millis`,
      onTimeout: () => Effect.fail(new ExpectTimeoutError({ timeoutMs })),
    }),
  );

  const executed = yield* executeWithTimeout.pipe(
    Effect.catchTag("ExpectTimeoutError", () =>
      Effect.succeed(emptyExecutedPlan(instruction, isHeadless, "Timed out")),
    ),
    Effect.catchTag("ExecutionError", (error) =>
      Effect.succeed(emptyExecutedPlan(instruction, isHeadless, error.message)),
    ),
  );

  yield* Effect.logInfo("expect.toPass completed", {
    url: resolvedUrl,
    stepCount: executed.steps.length,
    durationMs: Date.now() - startedAt,
  });

  return buildExpectResult(resolvedUrl, requirements, executed, startedAt);
});

const createExpectChain = (
  resolvedUrl: string,
  targetData: string | Record<string, unknown> | undefined,
  config: Partial<ExpectConfig>,
): ExpectChain => ({
  toPass: (
    requirements: Requirement | readonly Requirement[],
    options?: ToPassOptions,
  ): Promise<ExpectResult> => {
    const normalizedRequirements = normalizeRequirements(requirements);
    const agentBackend = DEFAULT_AGENT_BACKEND;
    const layer = layerNodeApi(agentBackend);

    return Effect.runPromise(
      Effect.scoped(
        executeToPass(
          resolvedUrl,
          targetData,
          normalizedRequirements,
          options,
          config,
        ),
      ).pipe(Effect.provide(layer)),
    );
  },
});

/**
 * Create an assertion chain for browser-based validation.
 *
 * Accepts a URL string, a target object with `url` and optional `data`,
 * or a Playwright `Page` instance.
 *
 * @example
 * ```ts
 * // Simple URL
 * await expect("http://localhost:3000/login").toPass([
 *   "signing in with valid credentials redirects to the dashboard",
 * ]);
 *
 * // Target object
 * await expect({
 *   url: "/login",
 *   data: { email: "test@example.com", password: "password123" },
 * }).toPass(["login redirects to dashboard"]);
 *
 * // Playwright page
 * await expect(page).toPass(["page shows correct content"]);
 * ```
 */
export const expect = (
  target: string | ExpectTarget | PlaywrightPage,
): ExpectChain => {
  const config = getGlobalConfig();

  if (isPlaywrightPage(target)) {
    const pageUrl = target.url();
    return createExpectChain(pageUrl, undefined, config);
  }

  if (typeof target === "string") {
    const resolvedUrl = resolveUrl(target, config.baseUrl);
    return createExpectChain(resolvedUrl, undefined, config);
  }

  const resolvedUrl = resolveUrl(target.url, config.baseUrl);
  return createExpectChain(resolvedUrl, target.data, config);
};
