import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAddGithubAction } from "../src/commands/add-github-action";

const TEMP_DIR_PREFIX = "expect-github-action-test-";

describe("add-github-action", () => {
  const originalCwd = process.cwd();
  const originalEnv = process.env;
  let tempDir: string | undefined;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      npm_config_user_agent: "pnpm/10.29.1 node/v22.0.0",
    };
    tempDir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.env = originalEnv;
    process.chdir(originalCwd);
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("generates a Claude workflow with Anthropic auth", async () => {
    await runAddGithubAction({ yes: true, agent: "claude" });

    const workflowPath = join(process.cwd(), ".github", "workflows", "expect.yml");
    expect(existsSync(workflowPath)).toBe(true);

    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}");
    expect(workflow).toContain("run: pnpm dlx expect-cli@latest --ci --agent claude");
  });

  it("generates a Codex workflow with OpenAI auth", async () => {
    await runAddGithubAction({ yes: true, agent: "codex" });

    const workflowPath = join(process.cwd(), ".github", "workflows", "expect.yml");
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
    expect(workflow).toContain("run: pnpm dlx expect-cli@latest --ci --agent codex");
  });

  it("defaults to Codex when it is the only detected supported agent", async () => {
    await runAddGithubAction({ yes: true, availableAgents: ["codex"] });

    const workflowPath = join(process.cwd(), ".github", "workflows", "expect.yml");
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
    expect(workflow).toContain("run: pnpm dlx expect-cli@latest --ci --agent codex");
  });
});
