import { ESTIMATED_CHARS_PER_TOKEN, INTERACTIVE_ROLES } from "../constants";
import type { RefMap, SnapshotStats } from "../types";
import type { ScrollContainerResult } from "../runtime/lib/scroll-detection";

export const computeSnapshotStats = (
  tree: string,
  refs: RefMap,
  scrollContainers?: ScrollContainerResult[],
): SnapshotStats => {
  const entries = Object.values(refs);
  const lines = tree.split("\n").length;
  const hasScrollFiltering = scrollContainers !== undefined && scrollContainers.length > 0;
  const totalHidden = hasScrollFiltering
    ? scrollContainers.reduce(
        (sum, container) => sum + container.hiddenAbove + container.hiddenBelow,
        0,
      )
    : 0;

  return {
    lines,
    characters: tree.length,
    estimatedTokens: Math.ceil(tree.length / ESTIMATED_CHARS_PER_TOKEN),
    totalRefs: entries.length,
    interactiveRefs: entries.filter((entry) => INTERACTIVE_ROLES.has(entry.role)).length,
    ...(hasScrollFiltering && { totalNodes: lines + totalHidden, visibleNodes: lines }),
  };
};
