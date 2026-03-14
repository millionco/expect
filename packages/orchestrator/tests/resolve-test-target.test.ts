import { beforeEach, describe, expect, it, vi } from "vitest";

const commandOutputs = new Map<string, string>();

vi.mock("node:child_process", () => ({
  execSync: vi.fn((command: string) => commandOutputs.get(command) ?? ""),
}));

describe("resolveTestTarget", () => {
  beforeEach(() => {
    commandOutputs.clear();
  });

  it("resolves unstaged targets with tracked and untracked context", async () => {
    commandOutputs.set("git rev-parse --abbrev-ref HEAD", "feature-branch");
    commandOutputs.set("git rev-parse --verify main", "main-hash");
    commandOutputs.set("git diff --shortstat", "2 files changed, 12 insertions(+), 3 deletions(-)");
    commandOutputs.set("git ls-files --others --exclude-standard", "src/new-file.ts");
    commandOutputs.set(
      "git ls-files --others --exclude-standard -z | xargs -0 wc -l 2>/dev/null | tail -1",
      "5 total",
    );
    commandOutputs.set("git diff --name-status", "M\tsrc/app.ts\nD\tsrc/old.ts");
    commandOutputs.set(
      'git log --format="%H\u001f%h\u001f%s" -n 10 main..HEAD',
      "abc123\u001fa1b2c3\u001fAdd onboarding flow",
    );
    commandOutputs.set("git diff main...HEAD --shortstat", "4 files changed, 20 insertions(+)");
    commandOutputs.set(
      "git diff --stat --unified=0",
      " src/app.ts | 4 ++--\n src/old.ts | 1 -\n 2 files changed, 2 insertions(+), 3 deletions(-)",
    );

    const { resolveTestTarget } = await import("../src/resolve-test-target.js");
    const target = resolveTestTarget({
      cwd: "/tmp/repo",
      selection: { action: "test-unstaged" },
    });

    expect(target.scope).toBe("unstaged");
    expect(target.displayName).toBe("unstaged changes on feature-branch");
    expect(target.diffStats).toEqual({
      filesChanged: 3,
      additions: 17,
      deletions: 3,
    });
    expect(target.changedFiles).toEqual([
      { status: "M", path: "src/app.ts" },
      { status: "D", path: "src/old.ts" },
      { status: "A", path: "src/new-file.ts" },
    ]);
  });

  it("resolves branch targets against main", async () => {
    commandOutputs.set("git rev-parse --abbrev-ref HEAD", "feature-branch");
    commandOutputs.set("git rev-parse --verify main", "main-hash");
    commandOutputs.set(
      "git diff main...HEAD --shortstat",
      "5 files changed, 14 insertions(+), 2 deletions(-)",
    );
    commandOutputs.set(
      "git diff --name-status main...HEAD",
      "M\tsrc/onboarding.ts\nA\tsrc/import.ts",
    );
    commandOutputs.set(
      'git log --format="%H\u001f%h\u001f%s" -n 10 main..HEAD',
      "abc123\u001fa1b2c3\u001fImprove onboarding\nxyz789\u001fx9y8z7\u001fFix project import",
    );
    commandOutputs.set(
      "git diff main...HEAD --stat --unified=0",
      " src/onboarding.ts | 8 +++++---\n src/import.ts | 6 ++++++\n 2 files changed, 11 insertions(+), 3 deletions(-)",
    );

    const { resolveTestTarget } = await import("../src/resolve-test-target.js");
    const target = resolveTestTarget({
      cwd: "/tmp/repo",
      selection: { action: "test-branch" },
    });

    expect(target.scope).toBe("branch");
    expect(target.branch.main).toBe("main");
    expect(target.changedFiles).toEqual([
      { status: "M", path: "src/onboarding.ts" },
      { status: "A", path: "src/import.ts" },
    ]);
    expect(target.recentCommits).toHaveLength(2);
  });

  it("resolves commit targets from the selected commit hash", async () => {
    commandOutputs.set("git rev-parse --abbrev-ref HEAD", "feature-branch");
    commandOutputs.set("git rev-parse --verify main", "main-hash");
    commandOutputs.set(
      'git log --format="%H\u001f%h\u001f%s" -n 1 deadbeef',
      "deadbeef\u001fdeadbee\u001fFix onboarding import step",
    );
    commandOutputs.set(
      "git show --shortstat --format= deadbeef",
      "1 file changed, 8 insertions(+), 1 deletion(-)",
    );
    commandOutputs.set(
      "git diff-tree --no-commit-id --name-status -r deadbeef",
      "M\tsrc/onboarding.ts",
    );
    commandOutputs.set(
      "git show --stat --unified=0 deadbeef",
      " src/onboarding.ts | 9 ++++++++ -\n 1 file changed, 8 insertions(+), 1 deletion(-)",
    );
    commandOutputs.set("git diff main...HEAD --shortstat", "2 files changed, 10 insertions(+)");

    const { resolveTestTarget } = await import("../src/resolve-test-target.js");
    const target = resolveTestTarget({
      cwd: "/tmp/repo",
      selection: { action: "select-commit", commitHash: "deadbeef" },
    });

    expect(target.scope).toBe("commit");
    expect(target.selectedCommit).toEqual({
      hash: "deadbeef",
      shortHash: "deadbee",
      subject: "Fix onboarding import step",
    });
    expect(target.changedFiles).toEqual([{ status: "M", path: "src/onboarding.ts" }]);
  });
});
