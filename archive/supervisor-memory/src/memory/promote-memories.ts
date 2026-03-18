import {
  MEMORY_COOKIE_ADVANTAGE_THRESHOLD,
  MEMORY_INDEX_VERSION,
  MEMORY_MAX_ENVIRONMENT_FACTS,
  MEMORY_MAX_SUMMARY_FAILURES,
  MEMORY_MAX_SUMMARY_FLOWS,
  MEMORY_MAX_SUMMARY_ROUTES,
  MEMORY_PROMOTION_MIN_OCCURRENCES,
} from "../constants";
import { readRunMemories, writeMemoryIndex, writeMemorySummary } from "./memory-store";
import type {
  EnvironmentFact,
  FailureMemory,
  FlowMemory,
  MemoryIndex,
  RouteMemory,
  RunMemoryRecord,
} from "./types";

const normalizeForGrouping = (text: string): string =>
  text.toLowerCase().replace(/\s+/g, " ").trim();

const sortByDateDescending = (records: RunMemoryRecord[]): RunMemoryRecord[] =>
  [...records].sort(
    (leftRecord, rightRecord) =>
      new Date(rightRecord.createdAt).getTime() - new Date(leftRecord.createdAt).getTime(),
  );

const collectRoutes = (runs: RunMemoryRecord[]): string[] => {
  const routes = new Set<string>();
  for (const run of runs) {
    for (const url of run.targetUrls) routes.add(url);
    for (const step of run.stepOutcomes) {
      if (step.routeHint) routes.add(step.routeHint);
    }
  }
  return [...routes];
};

const extractRouteMemories = (runs: RunMemoryRecord[]): RouteMemory[] => {
  const routes = collectRoutes(runs);

  return routes.map((route) => {
    const relevantRuns = runs.filter(
      (run) =>
        run.targetUrls.includes(route) || run.stepOutcomes.some((step) => step.routeHint === route),
    );

    const successCount = relevantRuns.filter((run) => run.status === "passed").length;
    const failureCount = relevantRuns.filter((run) => run.status === "failed").length;

    const cookieSuccesses = relevantRuns.filter(
      (run) => run.usedCookies && run.status === "passed",
    ).length;
    const noCookieFailures = relevantRuns.filter(
      (run) => !run.usedCookies && run.status === "failed",
    ).length;
    const requiresAuth = cookieSuccesses > 0 && noCookieFailures > 0;

    const issueCountByPattern = new Map<string, number>();
    for (const run of relevantRuns.filter((candidateRun) => candidateRun.status === "failed")) {
      for (const finding of run.findings) {
        const normalized = normalizeForGrouping(finding);
        issueCountByPattern.set(normalized, (issueCountByPattern.get(normalized) ?? 0) + 1);
      }
    }

    const commonIssues = [...issueCountByPattern.entries()]
      .filter(([, count]) => count >= MEMORY_PROMOTION_MIN_OCCURRENCES)
      .sort(([, leftCount], [, rightCount]) => rightCount - leftCount)
      .map(([issue]) => issue)
      .slice(0, 3);

    const lastTestedRun = sortByDateDescending(relevantRuns)[0];

    return {
      route,
      requiresAuth,
      lastTestedAt: lastTestedRun?.createdAt ?? new Date().toISOString(),
      successCount,
      failureCount,
      commonIssues,
    };
  });
};

const extractFlowMemories = (runs: RunMemoryRecord[]): FlowMemory[] => {
  const flowGroups = new Map<string, RunMemoryRecord[]>();
  for (const run of runs) {
    const key = normalizeForGrouping(run.instruction);
    const group = flowGroups.get(key) ?? [];
    group.push(run);
    flowGroups.set(key, group);
  }

  return [...flowGroups.entries()].map(([, groupRuns]) => {
    const latestRun = sortByDateDescending(groupRuns)[0];
    const successRuns = groupRuns.filter((run) => run.status === "passed");
    const failureRuns = groupRuns.filter((run) => run.status === "failed");
    const lastSuccess = sortByDateDescending(successRuns)[0];
    const lastFailure = sortByDateDescending(failureRuns)[0];
    const allTargetUrls = new Set(groupRuns.flatMap((run) => run.targetUrls));

    return {
      instruction: latestRun.instruction,
      planTitle: latestRun.planTitle,
      targetUrls: [...allTargetUrls],
      lastSuccessAt: lastSuccess?.createdAt,
      lastFailureAt: lastFailure?.createdAt,
      successCount: successRuns.length,
      failureCount: failureRuns.length,
    };
  });
};

const extractFailureMemories = (runs: RunMemoryRecord[]): FailureMemory[] => {
  const failureGroups = new Map<string, { runs: RunMemoryRecord[]; originalPattern: string }>();

  for (const run of runs) {
    for (const finding of run.findings) {
      const key = normalizeForGrouping(finding);
      const group = failureGroups.get(key);
      if (group) {
        group.runs.push(run);
      } else {
        failureGroups.set(key, { runs: [run], originalPattern: finding });
      }
    }
  }

  return [...failureGroups.entries()]
    .filter(([, group]) => group.runs.length >= MEMORY_PROMOTION_MIN_OCCURRENCES)
    .map(([, group]) => {
      const associatedRoutes = new Set(group.runs.flatMap((run) => run.targetUrls));
      const latestRun = sortByDateDescending(group.runs)[0];

      return {
        pattern: group.originalPattern,
        occurrenceCount: group.runs.length,
        lastSeenAt: latestRun.createdAt,
        associatedRoutes: [...associatedRoutes],
      };
    })
    .sort(
      (leftFailure, rightFailure) => rightFailure.occurrenceCount - leftFailure.occurrenceCount,
    );
};

const extractBaseUrlFact = (runs: RunMemoryRecord[]): EnvironmentFact | undefined => {
  const baseUrlCounts = new Map<string, number>();
  for (const run of runs) {
    if (run.baseUrl) {
      baseUrlCounts.set(run.baseUrl, (baseUrlCounts.get(run.baseUrl) ?? 0) + 1);
    }
  }

  const mostCommonEntry = [...baseUrlCounts.entries()].sort(
    ([, leftCount], [, rightCount]) => rightCount - leftCount,
  )[0];
  if (!mostCommonEntry || mostCommonEntry[1] < MEMORY_PROMOTION_MIN_OCCURRENCES) return undefined;

  return {
    fact: `Most commonly used base URL: ${mostCommonEntry[0]}`,
    confidence: mostCommonEntry[1] / runs.length,
    evidenceCount: mostCommonEntry[1],
  };
};

const extractCookieDependencyFact = (runs: RunMemoryRecord[]): EnvironmentFact | undefined => {
  const cookieRuns = runs.filter((run) => run.usedCookies);
  const noCookieRuns = runs.filter((run) => !run.usedCookies);
  if (cookieRuns.length === 0 || noCookieRuns.length === 0) return undefined;

  const cookieSuccessRate =
    cookieRuns.filter((run) => run.status === "passed").length / cookieRuns.length;
  const noCookieSuccessRate =
    noCookieRuns.filter((run) => run.status === "passed").length / noCookieRuns.length;

  if (cookieSuccessRate <= noCookieSuccessRate + MEMORY_COOKIE_ADVANTAGE_THRESHOLD) {
    return undefined;
  }

  return {
    fact: "Cookie reuse significantly improves test reliability",
    confidence: cookieSuccessRate - noCookieSuccessRate,
    evidenceCount: runs.length,
  };
};

const extractEnvironmentFacts = (runs: RunMemoryRecord[]): EnvironmentFact[] =>
  [extractBaseUrlFact(runs), extractCookieDependencyFact(runs)]
    .filter((fact): fact is EnvironmentFact => fact !== undefined)
    .slice(0, MEMORY_MAX_ENVIRONMENT_FACTS);

const generateMemorySummary = (index: MemoryIndex): string => {
  const sections: string[] = ["# Browser Tester Memory", ""];

  const authRoutes = index.routes.filter((route) => route.requiresAuth);
  const riskyRoutes = index.routes
    .filter((route) => route.failureCount > route.successCount)
    .sort((leftRoute, rightRoute) => rightRoute.failureCount - leftRoute.failureCount);

  if (index.environmentFacts.length > 0 || authRoutes.length > 0) {
    sections.push("## Environment");
    for (const fact of index.environmentFacts) {
      sections.push(`- ${fact.fact}`);
    }
    for (const route of authRoutes.slice(0, MEMORY_MAX_SUMMARY_ROUTES)) {
      sections.push(`- ${route.route} requires authentication`);
    }
    sections.push("");
  }

  const trustedFlows = index.flows
    .filter((flow) => flow.successCount > flow.failureCount)
    .sort((leftFlow, rightFlow) => rightFlow.successCount - leftFlow.successCount);

  if (trustedFlows.length > 0) {
    sections.push("## Trusted Flows");
    for (const flow of trustedFlows.slice(0, MEMORY_MAX_SUMMARY_FLOWS)) {
      sections.push(`- ${flow.planTitle} (${flow.successCount} pass, ${flow.failureCount} fail)`);
    }
    sections.push("");
  }

  if (riskyRoutes.length > 0) {
    sections.push("## Risky Surfaces");
    for (const route of riskyRoutes.slice(0, MEMORY_MAX_SUMMARY_ROUTES)) {
      const totalRuns = route.successCount + route.failureCount;
      sections.push(`- ${route.route} (${route.failureCount}/${totalRuns} failed)`);
    }
    sections.push("");
  }

  const significantFailures = index.failures
    .filter((failure) => failure.occurrenceCount >= MEMORY_PROMOTION_MIN_OCCURRENCES)
    .sort(
      (leftFailure, rightFailure) => rightFailure.occurrenceCount - leftFailure.occurrenceCount,
    );

  if (significantFailures.length > 0) {
    sections.push("## Recurring Failures");
    for (const failure of significantFailures.slice(0, MEMORY_MAX_SUMMARY_FAILURES)) {
      sections.push(`- ${failure.pattern} (${failure.occurrenceCount}x)`);
    }
    sections.push("");
  }

  sections.push(`_Last updated: ${index.lastUpdatedAt} | ${index.totalRuns} total runs_`);

  return sections.join("\n");
};

export const promoteMemories = (cwd: string): MemoryIndex => {
  const runs = readRunMemories(cwd);

  if (runs.length === 0) {
    return {
      version: MEMORY_INDEX_VERSION,
      lastUpdatedAt: new Date().toISOString(),
      totalRuns: 0,
      routes: [],
      flows: [],
      failures: [],
      environmentFacts: [],
    };
  }

  const index: MemoryIndex = {
    version: MEMORY_INDEX_VERSION,
    lastUpdatedAt: new Date().toISOString(),
    totalRuns: runs.length,
    routes: extractRouteMemories(runs),
    flows: extractFlowMemories(runs),
    failures: extractFailureMemories(runs),
    environmentFacts: extractEnvironmentFacts(runs),
  };

  writeMemoryIndex(cwd, index);
  writeMemorySummary(cwd, generateMemorySummary(index));

  return index;
};
