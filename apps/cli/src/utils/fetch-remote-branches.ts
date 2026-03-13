import { exec } from "child_process";
import { GH_TIMEOUT_MS, PR_LIMIT } from "../constants.js";

export interface RemoteBranch {
  name: string;
  author: string;
  prNumber: number | null;
  prStatus: "open" | "draft" | "merged" | null;
}

const normalizePrStatus = (
  state: string,
  isDraft: boolean,
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
}

const execAsync = (command: string): Promise<string> =>
  new Promise((resolve, reject) => {
    exec(command, { encoding: "utf-8", timeout: GH_TIMEOUT_MS }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });

const fetchPrs = async (state: string): Promise<GhPr[]> => {
  try {
    const output = await execAsync(
      `gh pr list --state ${state} --limit ${PR_LIMIT} --json headRefName,author,number,state,isDraft`,
    );
    return JSON.parse(output);
  } catch {
    return [];
  }
};

export const fetchRemoteBranches = async (): Promise<RemoteBranch[]> => {
  const [openPrs, mergedPrs] = await Promise.all([fetchPrs("open"), fetchPrs("merged")]);
  const allPrs = [...openPrs, ...mergedPrs];

  const prByBranch = new Map<string, GhPr>();
  for (const pr of allPrs) {
    if (!prByBranch.has(pr.headRefName)) {
      prByBranch.set(pr.headRefName, pr);
    }
  }

  try {
    const refOutput = await execAsync(
      "git branch -r --format='%(refname:short)' | grep -v HEAD",
    );

    if (!refOutput) return [];

    const remoteBranches = refOutput
      .split("\n")
      .filter(Boolean)
      .map((ref) => ref.replace(/^origin\//, ""));

    return remoteBranches.map((name) => {
      const pr = prByBranch.get(name);
      return {
        name,
        author: pr?.author.login ?? "",
        prNumber: pr?.number ?? null,
        prStatus: pr ? normalizePrStatus(pr.state, pr.isDraft) : null,
      };
    });
  } catch {
    return Array.from(prByBranch.values()).map((pr) => ({
      name: pr.headRefName,
      author: pr.author.login,
      prNumber: pr.number,
      prStatus: normalizePrStatus(pr.state, pr.isDraft),
    }));
  }
};
