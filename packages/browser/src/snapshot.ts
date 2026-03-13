import type { Page } from "playwright";
import { INTERACTIVE_ROLES, REF_PREFIX, SNAPSHOT_TIMEOUT_MS } from "./constants";
import type { RefMap, SnapshotOptions, SnapshotResult } from "./types";
import { compactTree } from "./utils/compact-tree";
import { createLocator } from "./utils/create-locator";
import { getIndentLevel } from "./utils/get-indent-level";
import { parseAriaLine } from "./utils/parse-aria-line";
import { resolveNthDuplicates } from "./utils/resolve-nth-duplicates";

const NO_INTERACTIVE_ELEMENTS = "(no interactive elements)";

const isTooDeep = (line: string, maxDepth?: number): boolean =>
  maxDepth !== undefined && getIndentLevel(line) > maxDepth;

const isFilteredOut = (role: string, interactive?: boolean): boolean =>
  Boolean(interactive) && !INTERACTIVE_ROLES.has(role);

export const snapshot = async (
  page: Page,
  options: SnapshotOptions = {},
): Promise<SnapshotResult> => {
  const timeout = options.timeout ?? SNAPSHOT_TIMEOUT_MS;
  const rawTree = await page.locator("body").ariaSnapshot({ timeout });

  const refs: RefMap = {};
  const filteredLines: string[] = [];
  let refCount = 0;

  for (const line of rawTree.split("\n")) {
    if (isTooDeep(line, options.maxDepth)) continue;

    const parsed = parseAriaLine(line);
    if (!parsed) {
      if (!options.interactive) filteredLines.push(line);
      continue;
    }

    if (isFilteredOut(parsed.role, options.interactive)) continue;

    const ref = `${REF_PREFIX}${++refCount}`;
    refs[ref] = { role: parsed.role, name: parsed.name };
    filteredLines.push(`${line} [ref=${ref}]`);
  }

  resolveNthDuplicates(refs);

  let tree = filteredLines.join("\n");
  if (options.interactive && refCount === 0) tree = NO_INTERACTIVE_ELEMENTS;
  if (options.compact) tree = compactTree(tree);

  return { tree, refs, locator: createLocator(page, refs) };
};
