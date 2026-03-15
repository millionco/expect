import { exec } from "child_process";
import { GH_TIMEOUT_MS, PR_LIMIT } from "../constants.js";

export interface RemoteBranch {
  name: string;
  author: string;
  prNumber: number | null;
  prStatus: "open" | "draft" | "merged" | null;
  updatedAt: string | null;
}

const normalizePrStatus = (
  state: string,
  isDraft: boolean
): "open" | "draft" | "merged" => {
  if (state === "MERGED") return "merged";
  if (isDraft) return "draft";
  return "open";
};

interface GhPr {
  headRefName: string;
  author: { login: string };
  number: number;
  state: string;
  isDraft: boolean;
  updatedAt: string;
}

const execAsync = (command: string): Promise<string> =>
  new Promise((resolve, reject) => {
    exec(
      command,
      { encoding: "utf-8", timeout: GH_TIMEOUT_MS },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      }
    );
  });

const fetchPrs = async (state: string): Promise<GhPr[]> => {
  try {
    const output = await execAsync(
      `gh pr list --state ${state} --limit ${PR_LIMIT} --json headRefName,author,number,state,isDraft,updatedAt`
    );
    return JSON.parse(output);
  } catch {
    return [];
  }
};

export const fetchRemoteBranches = async (): Promise<RemoteBranch[]> => {
  const [openPrs, mergedPrs] = await Promise.all([
    fetchPrs("open"),
    fetchPrs("merged"),
  ]);
  const allPrs = [...openPrs, ...mergedPrs];

  const pullRequestByBranch = new Map<string, GhPr>();
  for (const pullRequest of allPrs) {
    if (!pullRequestByBranch.has(pullRequest.headRefName)) {
      pullRequestByBranch.set(pullRequest.headRefName, pullRequest);
    }
  }

  try {
    const refOutput = await execAsync(
      "git branch -r --format='%(refname:short)' | grep -v HEAD"
    );

    if (!refOutput) return [];

    const remoteBranches = refOutput
      .split("\n")
      .filter(Boolean)
      .map((ref) => ref.replace(/^origin\//, ""));

    return remoteBranches.map((name) => {
      const pullRequest = pullRequestByBranch.get(name);
      return {
        name,
        author: pullRequest?.author.login ?? "",
        prNumber: pullRequest?.number ?? null,
        prStatus: pullRequest
          ? normalizePrStatus(pullRequest.state, pullRequest.isDraft)
          : null,
        updatedAt: pullRequest?.updatedAt ?? null,
      };
    });
  } catch {
    return Array.from(pullRequestByBranch.values()).map((pullRequest) => ({
      name: pullRequest.headRefName,
      author: pullRequest.author.login,
      prNumber: pullRequest.number,
      prStatus: normalizePrStatus(pullRequest.state, pullRequest.isDraft),
      updatedAt: pullRequest.updatedAt,
    }));
  }
};
