import { MEMORY_MAX_EXECUTOR_FAILURES, MEMORY_MAX_EXECUTOR_ROUTES } from "../constants.js";
import { readMemoryIndex } from "./memory-store.js";
import type { ExecutorMemoryContext, MemoryIndex, RouteMemory } from "./types.js";

const routeOverlaps = (routeA: string, routeB: string): boolean =>
  routeA.includes(routeB) || routeB.includes(routeA);

const findRelevantRoutes = (index: MemoryIndex, targetUrls: string[]): RouteMemory[] =>
  index.routes
    .filter(
      (route) =>
        targetUrls.some((url) => routeOverlaps(url, route.route)) ||
        route.requiresAuth ||
        route.failureCount > 0,
    )
    .sort((leftRoute, rightRoute) => {
      const leftRelevance = targetUrls.some((url) => routeOverlaps(url, leftRoute.route)) ? 10 : 0;
      const rightRelevance = targetUrls.some((url) => routeOverlaps(url, rightRoute.route))
        ? 10
        : 0;
      return rightRelevance + rightRoute.failureCount - (leftRelevance + leftRoute.failureCount);
    })
    .slice(0, MEMORY_MAX_EXECUTOR_ROUTES);

export const retrieveExecutorMemory = (
  cwd: string,
  context: ExecutorMemoryContext,
): string | undefined => {
  const index = readMemoryIndex(cwd);
  if (index.totalRuns === 0) return undefined;

  const sections: string[] = [];

  const relevantRoutes = findRelevantRoutes(index, context.targetUrls);
  if (relevantRoutes.length > 0) {
    const routeLines = relevantRoutes.map((route) => {
      const parts = [`- ${route.route}`];
      if (route.requiresAuth) parts.push("(requires auth)");
      if (route.failureCount > 0) parts.push(`(${route.failureCount} past failures)`);
      if (route.commonIssues.length > 0) {
        parts.push(`watch for: ${route.commonIssues.slice(0, 2).join(", ")}`);
      }
      return parts.join(" ");
    });
    sections.push(["Route hints from past runs:", ...routeLines].join("\n"));
  }

  const relevantFailures = index.failures
    .filter((failure) =>
      context.targetUrls.some((url) =>
        failure.associatedRoutes.some((route) => routeOverlaps(url, route)),
      ),
    )
    .sort((leftFailure, rightFailure) => rightFailure.occurrenceCount - leftFailure.occurrenceCount)
    .slice(0, MEMORY_MAX_EXECUTOR_FAILURES);

  if (relevantFailures.length > 0) {
    const failureLines = relevantFailures.map(
      (failure) => `- ${failure.pattern} (seen ${failure.occurrenceCount}x)`,
    );
    sections.push(["Known issues to watch for:", ...failureLines].join("\n"));
  }

  if (sections.length === 0) return undefined;

  return sections.join("\n\n");
};
