import {
  MEMORY_MAX_PLANNER_FAILURES,
  MEMORY_MAX_PLANNER_FLOWS,
  MEMORY_MAX_PLANNER_ROUTES,
} from "../constants";
import { readMemoryIndex } from "./memory-store";
import type { MemoryIndex, PlannerMemoryContext } from "./types";

const formatRouteMemories = (index: MemoryIndex): string[] => {
  const relevantRoutes = index.routes
    .filter((route) => route.requiresAuth || route.failureCount > 0)
    .sort((leftRoute, rightRoute) => {
      return (
        rightRoute.failureCount +
        rightRoute.successCount -
        (leftRoute.failureCount + leftRoute.successCount)
      );
    })
    .slice(0, MEMORY_MAX_PLANNER_ROUTES);

  return relevantRoutes.map((route) => {
    const parts = [`- ${route.route}`];
    if (route.requiresAuth) parts.push("(requires auth)");
    const totalRuns = route.successCount + route.failureCount;
    if (totalRuns > 1) parts.push(`(${route.successCount}/${totalRuns} passed)`);
    if (route.commonIssues.length > 0) {
      parts.push(`common issues: ${route.commonIssues.slice(0, 2).join(", ")}`);
    }
    return parts.join(" ");
  });
};

const formatFlowMemories = (index: MemoryIndex, instruction: string): string[] => {
  const normalizedInstruction = instruction.toLowerCase();
  const relevantFlows = index.flows
    .filter((flow) => flow.successCount > 0)
    .sort((leftFlow, rightFlow) => {
      const leftRelevance = leftFlow.instruction.toLowerCase().includes(normalizedInstruction)
        ? 10
        : 0;
      const rightRelevance = rightFlow.instruction.toLowerCase().includes(normalizedInstruction)
        ? 10
        : 0;
      return rightRelevance + rightFlow.successCount - (leftRelevance + leftFlow.successCount);
    })
    .slice(0, MEMORY_MAX_PLANNER_FLOWS);

  return relevantFlows.map(
    (flow) =>
      `- "${flow.planTitle}" (${flow.successCount} pass, ${flow.failureCount} fail): ${flow.instruction}`,
  );
};

const formatFailureMemories = (index: MemoryIndex): string[] =>
  index.failures
    .sort((leftFailure, rightFailure) => rightFailure.occurrenceCount - leftFailure.occurrenceCount)
    .slice(0, MEMORY_MAX_PLANNER_FAILURES)
    .map((failure) => {
      const parts = [`- ${failure.pattern} (seen ${failure.occurrenceCount}x)`];
      if (failure.associatedRoutes.length > 0) {
        parts.push(`on: ${failure.associatedRoutes.slice(0, 3).join(", ")}`);
      }
      return parts.join(" ");
    });

const formatEnvironmentFacts = (index: MemoryIndex): string[] =>
  index.environmentFacts.filter((fact) => fact.confidence >= 0.5).map((fact) => `- ${fact.fact}`);

export const retrievePlannerMemory = (
  cwd: string,
  context: PlannerMemoryContext,
): string | undefined => {
  const index = readMemoryIndex(cwd);
  if (index.totalRuns === 0) return undefined;

  const sections: string[] = [];

  const environmentFacts = formatEnvironmentFacts(index);
  if (environmentFacts.length > 0) {
    sections.push(["Environment facts:", ...environmentFacts].join("\n"));
  }

  const routeMemories = formatRouteMemories(index);
  if (routeMemories.length > 0) {
    sections.push(["Known route characteristics:", ...routeMemories].join("\n"));
  }

  const flowMemories = formatFlowMemories(index, context.instruction);
  if (flowMemories.length > 0) {
    sections.push(["Previously tested flows:", ...flowMemories].join("\n"));
  }

  const failureMemories = formatFailureMemories(index);
  if (failureMemories.length > 0) {
    sections.push(["Recurring failure patterns:", ...failureMemories].join("\n"));
  }

  if (sections.length === 0) return undefined;

  return sections.join("\n\n");
};
