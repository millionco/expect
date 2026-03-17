import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalize, parse } from "pathe";
import {
  FLOW_DIRECTORY_NAME,
  SAVED_FLOW_DIRECTORY_FALLBACK_SEGMENT,
  SAVED_FLOW_DIRECTORY_HASH_LENGTH,
  TESTIE_STATE_DIR,
} from "../constants.js";
import { slugify } from "./slugify.js";

const ROOT_SEPARATOR_PATTERN = /[/:\\]+/g;

const getRootSegment = (rootPath: string): string | null => {
  const normalizedRoot = slugify(rootPath.replace(ROOT_SEPARATOR_PATTERN, "-"));
  return normalizedRoot === "untitled-flow" ? null : normalizedRoot;
};

const getSluggedPathSegments = (directoryPath: string): string[] => {
  const pathSegments: string[] = [];
  let currentPath = normalize(directoryPath);

  while (currentPath) {
    const parsedPath = parse(currentPath);

    if (parsedPath.base) {
      pathSegments.unshift(slugify(parsedPath.base));
    }

    if (!parsedPath.dir || parsedPath.dir === parsedPath.root) {
      const rootSegment = getRootSegment(parsedPath.root);
      return rootSegment ? [rootSegment, ...pathSegments] : pathSegments;
    }

    currentPath = parsedPath.dir;
  }

  return pathSegments;
};

const getDirectoryHash = (directoryPath: string): string =>
  createHash("sha256")
    .update(normalize(directoryPath))
    .digest("hex")
    .slice(0, SAVED_FLOW_DIRECTORY_HASH_LENGTH);

export const getSavedFlowDirectoryPath = (cwd: string = process.cwd()): string => {
  const sluggedPathSegments = getSluggedPathSegments(cwd);
  const uniquePathSegments =
    sluggedPathSegments.length > 0
      ? [...sluggedPathSegments]
      : [SAVED_FLOW_DIRECTORY_FALLBACK_SEGMENT];
  const leafSegmentIndex = uniquePathSegments.length - 1;

  uniquePathSegments[leafSegmentIndex] =
    `${uniquePathSegments[leafSegmentIndex]}-${getDirectoryHash(cwd)}`;

  return join(homedir(), TESTIE_STATE_DIR, FLOW_DIRECTORY_NAME, ...uniquePathSegments);
};
