import type { ChangedFile } from "../types";

const HIGH_SIGNAL_FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const HIGH_SIGNAL_PATH_SEGMENTS = [
  "/app/",
  "/src/",
  "/components/",
  "/pages/",
  "/routes/",
  "/stores/",
  "/api/",
  "/lib/",
  "/ui/",
];
const HIGH_SIGNAL_NAME_PATTERNS = [
  "page",
  "layout",
  "route",
  "panel",
  "task",
  "card",
  "chat",
  "store",
  "dialog",
  "modal",
];
const LOW_SIGNAL_PATH_PATTERNS = [
  /^\.agents\//,
  /^\.browser-tester\//,
  /^\.browser-tester-logs\//,
  /^\.tgz\//,
  /^node_modules\//,
  /^dist\//,
  /^coverage\//,
  /^skills-lock\.json$/,
  /\.mdx?$/,
  /\.log$/,
  /\.tgz$/,
  /\.zip$/,
  /\.gz$/,
  /\.png$/,
  /\.jpe?g$/,
  /\.gif$/,
  /\.svg$/,
  /\.ico$/,
];

const getPlanningFileScore = (changedFile: ChangedFile): number => {
  const normalizedPath = changedFile.path.toLowerCase();
  let score = 0;

  if (LOW_SIGNAL_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath))) score -= 100;
  if (HIGH_SIGNAL_FILE_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension)))
    score += 5;
  if (HIGH_SIGNAL_PATH_SEGMENTS.some((segment) => normalizedPath.includes(segment))) score += 5;
  if (HIGH_SIGNAL_NAME_PATTERNS.some((pattern) => normalizedPath.includes(pattern))) score += 3;
  if (changedFile.status === "A" || changedFile.status === "D") score += 1;

  return score;
};

export const prioritizePlanningFiles = (changedFiles: ChangedFile[]): ChangedFile[] =>
  [...changedFiles].sort((leftFile, rightFile) => {
    const scoreDifference = getPlanningFileScore(rightFile) - getPlanningFileScore(leftFile);
    if (scoreDifference !== 0) return scoreDifference;
    return leftFile.path.localeCompare(rightFile.path);
  });
