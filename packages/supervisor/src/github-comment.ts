import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as util from "node:util";
import { Schema } from "effect";
import { COMMENT_DIRECTORY_PREFIX, GITHUB_TIMEOUT_MS } from "./constants";
import type { BrowserRunPullRequest, BrowserRunReport } from "./types";
import { commandExists } from "./utils/command-exists";

const execFileAsync = util.promisify(child_process.execFile);

const PullRequestSchema = Schema.Struct({
  number: Schema.Number,
  url: Schema.String,
  title: Schema.String,
  headRefName: Schema.String,
});

const PullRequestListSchema = Schema.Array(PullRequestSchema);

export interface PostPullRequestCommentOptions {
  cwd: string;
  report: BrowserRunReport;
}

export interface PostPullRequestCommentResult {
  bodyPath: string;
  pullRequest: BrowserRunPullRequest;
}

const runGhCommand = async (cwd: string, args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync("gh", args, {
    cwd,
    encoding: "utf-8",
    timeout: GITHUB_TIMEOUT_MS,
  });
  return stdout.trim();
};

const isRemoteShareUrl = (shareUrl: string | undefined): boolean =>
  typeof shareUrl === "string" &&
  (shareUrl.startsWith("https://") || shareUrl.startsWith("http://"));

export const getPullRequestForBranch = async (
  cwd: string,
  branch: string,
): Promise<BrowserRunPullRequest | null> => {
  if (!(await commandExists("gh"))) return null;

  try {
    const output = await runGhCommand(cwd, [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "open",
      "--limit",
      "1",
      "--json",
      "number,url,title,headRefName",
    ]);
    const pullRequests = Schema.decodeUnknownSync(PullRequestListSchema)(JSON.parse(output));
    return pullRequests[0] ?? null;
  } catch {
    return null;
  }
};

export const buildPullRequestCommentBody = (report: BrowserRunReport): string => {
  const findingLines =
    report.findings.length > 0
      ? report.findings.slice(0, 5).map((finding) => `- ${finding.title}: ${finding.detail}`)
      : ["- No blocking findings detected."];

  const riskLines = ["- No outstanding risk areas called out by the plan."];

  const artifactLines: string[] = [];
  if (isRemoteShareUrl(report.artifacts.shareUrl)) {
    artifactLines.push(`- Full report: ${report.artifacts.shareUrl}`);
  }
  if (report.artifacts.screenshotPaths.length > 0) {
    artifactLines.push(`- ${report.artifacts.screenshotPaths.length} screenshot(s) saved locally`);
  }

  return [
    `## Browser test ${report.status}`,
    "",
    report.summary,
    "",
    "### Findings",
    ...findingLines,
    "",
    "### Risk areas",
    ...riskLines,
    ...(artifactLines.length > 0 ? ["", "### Artifacts", ...artifactLines] : []),
  ].join("\n");
};

export const postPullRequestComment = async (
  options: PostPullRequestCommentOptions,
): Promise<PostPullRequestCommentResult> => {
  if (!options.report.pullRequest) {
    throw new Error("No open pull request is associated with this branch.");
  }

  if (!(await commandExists("gh"))) {
    throw new Error("GitHub CLI is not installed or is not available in PATH.");
  }

  const body = buildPullRequestCommentBody(options.report);
  const outputDirectoryPath = fs.mkdtempSync(path.join(os.tmpdir(), COMMENT_DIRECTORY_PREFIX));
  const bodyPath = path.join(outputDirectoryPath, "pull-request-comment.md");
  fs.writeFileSync(bodyPath, body, "utf-8");

  await runGhCommand(options.cwd, [
    "pr",
    "comment",
    String(options.report.pullRequest.number),
    "--body-file",
    bodyPath,
  ]);

  return {
    bodyPath,
    pullRequest: options.report.pullRequest,
  };
};
