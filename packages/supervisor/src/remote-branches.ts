import { execFile } from "node:child_process";
import { PR_LIMIT } from "./constants";

const WHICH_COMMAND = process.platform === "win32" ? "where" : "which";

const GH_PR_FIELDS = "headRefName,author,number,state,isDraft,updatedAt";

interface RemoteBranchResult {
  name: string;
  author: string;
  prNumber: number | null;
  prStatus: "open" | "draft" | "merged" | null;
  updatedAt: string | null;
}

interface GhPrItem {
  headRefName: string;
  author: { login: string };
  number: number;
  state: string;
  isDraft: boolean;
  updatedAt: string;
}

const execCommand = (command: string, args: string[], cwd?: string): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });

const normalizePrStatus = (state: string, isDraft: boolean): "open" | "draft" | "merged" | null => {
  if (isDraft) return "draft";
  if (state === "MERGED") return "merged";
  if (state === "OPEN") return "open";
  return null;
};

export const fetchRemoteBranches = async (cwd: string): Promise<RemoteBranchResult[]> => {
  let branchOutput: string;
  try {
    branchOutput = await execCommand("git", ["branch", "-r", "--format=%(refname:short)"], cwd);
  } catch {
    return [];
  }

  const branches = branchOutput
    .split("\n")
    .map((line) => line.replace("origin/", "").trim())
    .filter((name) => Boolean(name) && name !== "HEAD");

  let ghAvailable = false;
  try {
    await execCommand(WHICH_COMMAND, ["gh"]);
    ghAvailable = true;
  } catch {
    // gh not available
  }

  if (!ghAvailable) {
    return branches.map((name) => ({
      name,
      author: "",
      prNumber: null,
      prStatus: null,
      updatedAt: null,
    }));
  }

  const fetchPrs = async (state: string): Promise<GhPrItem[]> => {
    try {
      const output = await execCommand("gh", [
        "pr",
        "list",
        "--state",
        state,
        "--limit",
        String(PR_LIMIT),
        "--json",
        GH_PR_FIELDS,
      ]);
      return JSON.parse(output) as GhPrItem[];
    } catch {
      return [];
    }
  };

  const [openPrs, mergedPrs] = await Promise.all([fetchPrs("open"), fetchPrs("merged")]);

  const prMap = new Map<string, GhPrItem>();
  for (const pullRequest of [...openPrs, ...mergedPrs]) {
    prMap.set(pullRequest.headRefName, pullRequest);
  }

  return branches.map((name) => {
    const pullRequest = prMap.get(name);
    if (!pullRequest) {
      return {
        name,
        author: "",
        prNumber: null,
        prStatus: null,
        updatedAt: null,
      };
    }
    return {
      name,
      author: pullRequest.author.login,
      prNumber: pullRequest.number,
      prStatus: normalizePrStatus(pullRequest.state, pullRequest.isDraft),
      updatedAt: pullRequest.updatedAt,
    };
  });
};
