import { execSync } from "node:child_process";
import {
  CHANGED_FILE_LIMIT,
  DIFF_PREVIEW_CHAR_LIMIT,
  GIT_TIMEOUT_MS,
  RECENT_COMMIT_LIMIT,
} from "./constants.js";
import type { ChangedFile, CommitSummary, DiffStats } from "./types.js";

const MAIN_BRANCH_NAMES = ["main", "master"];
const FIELD_SEPARATOR = "\u001f";

const execGit = (cwd: string, command: string): string => {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout: GIT_TIMEOUT_MS,
    }).trim();
  } catch {
    return "";
  }
};

export const getCurrentBranchName = (cwd: string): string =>
  execGit(cwd, "git rev-parse --abbrev-ref HEAD") || "unknown";

export const getMainBranchName = (cwd: string): string | null => {
  for (const branchName of MAIN_BRANCH_NAMES) {
    const output = execGit(cwd, `git rev-parse --verify ${branchName}`);
    if (output) return branchName;
  }
  return null;
};

export const parseDiffStats = (shortStat: string): DiffStats | null => {
  if (!shortStat) return null;

  const filesMatch = shortStat.match(/(\d+) files? changed/);
  if (!filesMatch) return null;

  const additionsMatch = shortStat.match(/(\d+) insertions?/);
  const deletionsMatch = shortStat.match(/(\d+) deletions?/);

  return {
    filesChanged: Number.parseInt(filesMatch[1], 10),
    additions: additionsMatch ? Number.parseInt(additionsMatch[1], 10) : 0,
    deletions: deletionsMatch ? Number.parseInt(deletionsMatch[1], 10) : 0,
  };
};

const getUntrackedFiles = (cwd: string): string[] => {
  const output = execGit(cwd, "git ls-files --others --exclude-standard");
  if (!output) return [];
  return output.split("\n").filter(Boolean);
};

const getUntrackedLineCount = (cwd: string): number => {
  const output = execGit(
    cwd,
    "git ls-files --others --exclude-standard -z | xargs -0 wc -l 2>/dev/null | tail -1",
  );
  const lineCountMatch = output.match(/(\d+)/);
  return lineCountMatch ? Number.parseInt(lineCountMatch[1], 10) : 0;
};

export const getUnstagedDiffStats = (cwd: string): DiffStats | null => {
  const trackedStats = parseDiffStats(execGit(cwd, "git diff --shortstat"));
  const untrackedFiles = getUntrackedFiles(cwd);
  if (!trackedStats && untrackedFiles.length === 0) return null;

  return {
    filesChanged: (trackedStats?.filesChanged ?? 0) + untrackedFiles.length,
    additions: (trackedStats?.additions ?? 0) + getUntrackedLineCount(cwd),
    deletions: trackedStats?.deletions ?? 0,
  };
};

const parseNameStatus = (output: string): ChangedFile[] =>
  output
    .split("\n")
    .filter(Boolean)
    .slice(0, CHANGED_FILE_LIMIT)
    .map((line) => {
      const [status, ...pathParts] = line.split("\t");
      return {
        status,
        path: pathParts.join("\t"),
      };
    })
    .filter((file) => Boolean(file.path));

export const getUnstagedChangedFiles = (cwd: string): ChangedFile[] => {
  const trackedFiles = parseNameStatus(execGit(cwd, "git diff --name-status"));
  const untrackedFiles = getUntrackedFiles(cwd).map((path) => ({ path, status: "A" }));
  const mergedFiles = [...trackedFiles];

  for (const untrackedFile of untrackedFiles) {
    if (!mergedFiles.some((file) => file.path === untrackedFile.path))
      mergedFiles.push(untrackedFile);
  }

  return mergedFiles.slice(0, CHANGED_FILE_LIMIT);
};

export const getBranchDiffStats = (cwd: string, mainBranchName: string): DiffStats | null =>
  parseDiffStats(execGit(cwd, `git diff ${mainBranchName}...HEAD --shortstat`));

export const getBranchChangedFiles = (cwd: string, mainBranchName: string): ChangedFile[] =>
  parseNameStatus(execGit(cwd, `git diff --name-status ${mainBranchName}...HEAD`));

export const getCommitChangedFiles = (cwd: string, commitHash: string): ChangedFile[] =>
  parseNameStatus(execGit(cwd, `git diff-tree --no-commit-id --name-status -r ${commitHash}`));

export const getCommitDiffStats = (cwd: string, commitHash: string): DiffStats | null =>
  parseDiffStats(execGit(cwd, `git show --shortstat --format= ${commitHash}`));

const parseCommits = (output: string): CommitSummary[] =>
  output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, subject] = line.split(FIELD_SEPARATOR);
      return { hash, shortHash, subject };
    })
    .filter((commit) => Boolean(commit.hash) && Boolean(commit.shortHash));

export const getBranchCommits = (cwd: string, mainBranchName: string): CommitSummary[] =>
  parseCommits(
    execGit(
      cwd,
      `git log --format="%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s" -n ${RECENT_COMMIT_LIMIT} ${mainBranchName}..HEAD`,
    ),
  );

export const getCommitSummary = (cwd: string, commitHash: string): CommitSummary | null => {
  const output = execGit(
    cwd,
    `git log --format="%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s" -n 1 ${commitHash}`,
  );
  return parseCommits(output)[0] ?? null;
};

const trimDiffPreview = (diffPreview: string): string => {
  if (diffPreview.length <= DIFF_PREVIEW_CHAR_LIMIT) return diffPreview;
  return `${diffPreview.slice(0, DIFF_PREVIEW_CHAR_LIMIT)}\n...truncated...`;
};

export const getUnstagedDiffPreview = (cwd: string): string => {
  const trackedPreview = execGit(cwd, "git diff --stat --unified=0");
  const untrackedFiles = getUntrackedFiles(cwd);
  const untrackedPreview =
    untrackedFiles.length > 0 ? `\n\nUntracked files:\n${untrackedFiles.join("\n")}` : "";
  return trimDiffPreview(`${trackedPreview}${untrackedPreview}`.trim());
};

export const getBranchDiffPreview = (cwd: string, mainBranchName: string): string =>
  trimDiffPreview(execGit(cwd, `git diff ${mainBranchName}...HEAD --stat --unified=0`));

export const getCommitDiffPreview = (cwd: string, commitHash: string): string =>
  trimDiffPreview(execGit(cwd, `git show --stat --unified=0 ${commitHash}`));
