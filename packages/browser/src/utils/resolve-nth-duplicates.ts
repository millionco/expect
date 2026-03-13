import type { RefMap } from "../types";

export const resolveNthDuplicates = (refs: RefMap): void => {
  const groups = new Map<string, string[]>();

  for (const [ref, entry] of Object.entries(refs)) {
    const key = `${entry.role}|${entry.name}`;
    const group = groups.get(key);
    if (group) {
      group.push(ref);
    } else {
      groups.set(key, [ref]);
    }
  }

  for (const refIds of groups.values()) {
    if (refIds.length > 1) {
      refIds.forEach((refId, nthIndex) => {
        refs[refId].nth = nthIndex;
      });
    }
  }
};
