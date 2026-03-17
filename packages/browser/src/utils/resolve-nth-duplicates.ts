import type { RefMap } from "../types";

const groupKey = (role: string, name: string): string => `${role}|${name}`;

export const resolveNthDuplicates = (refs: RefMap): void => {
  const groups = new Map<string, string[]>();

  for (const [ref, entry] of Object.entries(refs)) {
    const key = groupKey(entry.role, entry.name);
    const existing = groups.get(key);
    if (existing) existing.push(ref);
    else groups.set(key, [ref]);
  }

  for (const refIds of groups.values()) {
    if (refIds.length <= 1) continue;
    for (let nthIndex = 0; nthIndex < refIds.length; nthIndex++) {
      refs[refIds[nthIndex]].nth = nthIndex;
    }
  }
};
