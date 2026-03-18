import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchRemoteBranches } from "../src/remote-branches";

const commandOutputs = new Map<string, string>();

vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (
      command: string,
      args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string) => void,
    ) => {
      const key = [command, ...args].join(" ");
      const output = commandOutputs.get(key);
      if (output === undefined) {
        callback(new Error(`Command failed: ${key}`), "");
      } else {
        callback(null, output);
      }
    },
  ),
}));

const GH_PR_FIELDS = "headRefName,author,number,state,isDraft,updatedAt";

const setGhAvailable = () => {
  commandOutputs.set("which gh", "/usr/local/bin/gh");
};

const setRemoteBranches = (branches: string[]) => {
  commandOutputs.set(
    "git branch -r --format=%(refname:short)",
    branches.map((name) => `origin/${name}`).join("\n"),
  );
};

interface MockPullRequest {
  headRefName: string;
  author: string;
  number: number;
  state: string;
  isDraft: boolean;
  updatedAt: string;
}

const setGhPrs = (state: "open" | "merged", pullRequests: MockPullRequest[]) => {
  commandOutputs.set(
    `gh pr list --state ${state} --limit 100 --json ${GH_PR_FIELDS}`,
    JSON.stringify(
      pullRequests.map((pullRequest) => ({
        ...pullRequest,
        author: { login: pullRequest.author },
      })),
    ),
  );
};

describe("fetchRemoteBranches", () => {
  beforeEach(() => {
    commandOutputs.clear();
  });

  it("returns branches enriched with PR data when gh is available", async () => {
    setGhAvailable();
    setRemoteBranches(["feature-a", "feature-b", "HEAD"]);
    setGhPrs("open", [
      {
        headRefName: "feature-a",
        author: "alice",
        number: 42,
        state: "OPEN",
        isDraft: false,
        updatedAt: "2025-01-15T10:00:00Z",
      },
    ]);
    setGhPrs("merged", []);

    const branches = await fetchRemoteBranches("/tmp/repo");

    expect(branches).toEqual([
      {
        name: "feature-a",
        author: "alice",
        prNumber: 42,
        prStatus: "open",
        updatedAt: "2025-01-15T10:00:00Z",
      },
      {
        name: "feature-b",
        author: "",
        prNumber: null,
        prStatus: null,
        updatedAt: null,
      },
    ]);
  });

  it("returns branches without PR data when gh is not available", async () => {
    setRemoteBranches(["feature-a", "main"]);

    const branches = await fetchRemoteBranches("/tmp/repo");

    expect(branches).toEqual([
      { name: "feature-a", author: "", prNumber: null, prStatus: null, updatedAt: null },
      { name: "main", author: "", prNumber: null, prStatus: null, updatedAt: null },
    ]);
  });

  it("returns empty array when git branch -r fails", async () => {
    const branches = await fetchRemoteBranches("/tmp/not-a-repo");
    expect(branches).toEqual([]);
  });

  it("filters out HEAD from remote branches", async () => {
    setRemoteBranches(["HEAD", "main", "feature"]);

    const branches = await fetchRemoteBranches("/tmp/repo");

    expect(branches.map((branch) => branch.name)).toEqual(["main", "feature"]);
  });

  it("normalizes draft PR status", async () => {
    setGhAvailable();
    setRemoteBranches(["draft-branch"]);
    setGhPrs("open", [
      {
        headRefName: "draft-branch",
        author: "bob",
        number: 7,
        state: "OPEN",
        isDraft: true,
        updatedAt: "2025-02-01T12:00:00Z",
      },
    ]);
    setGhPrs("merged", []);

    const branches = await fetchRemoteBranches("/tmp/repo");

    expect(branches[0].prStatus).toBe("draft");
  });

  it("normalizes merged PR status", async () => {
    setGhAvailable();
    setRemoteBranches(["merged-branch"]);
    setGhPrs("open", []);
    setGhPrs("merged", [
      {
        headRefName: "merged-branch",
        author: "carol",
        number: 99,
        state: "MERGED",
        isDraft: false,
        updatedAt: "2025-03-10T08:00:00Z",
      },
    ]);

    const branches = await fetchRemoteBranches("/tmp/repo");

    expect(branches[0].prStatus).toBe("merged");
  });
});
