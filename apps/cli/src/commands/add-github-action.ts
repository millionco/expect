import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect } from "effect";
import { detectProject } from "@expect/supervisor/detect-project";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { prompts } from "../utils/prompts";
import { type PackageManager, detectNonInteractive, detectPackageManager } from "./init-utils";

interface AddGithubActionOptions {
  yes?: boolean;
}

const DEV_COMMAND_DEFAULTS: Record<PackageManager, string> = {
  npm: "npm run dev",
  pnpm: "pnpm dev",
  yarn: "yarn dev",
  bun: "bun dev",
  vp: "vp dev",
};

const DLX_COMMANDS: Record<PackageManager, string> = {
  npm: "npx",
  pnpm: "pnpm dlx",
  yarn: "npx",
  bun: "bunx",
  vp: "npx",
};

const INSTALL_COMMANDS: Record<PackageManager, string> = {
  npm: "npm ci",
  pnpm: "pnpm install",
  yarn: "yarn install --frozen-lockfile",
  bun: "bun install",
  vp: "npm ci",
};

const generateWorkflow = (packageManager: PackageManager, devCommand: string, devUrl: string) => {
  const dlx = DLX_COMMANDS[packageManager];
  const install = INSTALL_COMMANDS[packageManager];

  const setupSteps = buildSetupSteps(packageManager);

  return `name: Expect Browser Tests

on:
  pull_request:
    branches: [main]

jobs:
  expect:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      pull-requests: write
    env:
      ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
      # Expect uses this local app URL as the browser test target in CI.
      EXPECT_BASE_URL: "${devUrl}"
    steps:
      - uses: actions/checkout@v4
${setupSteps}
      - name: Install dependencies
        run: ${install}

      # Expect runs against your dev server by default, not a production build or deployed preview.
      # To test a preview URL instead, set EXPECT_BASE_URL to that URL. You can use
      # https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds
      # to pass preview URLs from other jobs.
      - name: Start dev server
        run: ${devCommand} &

      # Wait until the local app is reachable before handing control to the browser agent.
      - name: Wait for dev server
        run: npx wait-on ${devUrl} --timeout 60000

      
      - name: Run expect
        env:
          # Expect uses the GitHub token to comment on the pull request.
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: ${dlx} expect-cli@latest --ci

      # Upload browser recordings and traces from .expect so failures are debuggable after the run.
      - name: Upload test artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: expect-test-results
          path: .expect/sessions/
          if-no-files-found: ignore
`;
};

const buildSetupSteps = (packageManager: PackageManager): string => {
  if (packageManager === "pnpm") {
    return `
      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm`;
  }

  if (packageManager === "bun") {
    return `
      - uses: oven-sh/setup-bun@v2`;
  }

  if (packageManager === "yarn") {
    return `
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: yarn`;
  }

  return `
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm`;
};

export const runAddGithubAction = async (options: AddGithubActionOptions = {}) => {
  const nonInteractive = detectNonInteractive(options.yes ?? false);
  const packageManager = detectPackageManager();

  const detection = await Effect.runPromise(
    detectProject().pipe(Effect.provide(NodeServices.layer)),
  );
  const detectedPort = detection.customPort ?? detection.defaultPort;
  let devCommand = DEV_COMMAND_DEFAULTS[packageManager];
  let devUrl = `http://localhost:${detectedPort}`;

  if (!nonInteractive) {
    const responses = await prompts([
      {
        type: "text",
        name: "devCommand",
        message: "Dev server command:",
        initial: devCommand,
      },
      {
        type: "text",
        name: "devUrl",
        message: "Dev server URL:",
        initial: devUrl,
      },
    ]);
    devCommand = responses.devCommand || devCommand;
    devUrl = responses.devUrl || devUrl;
  }

  const workflowDir = join(process.cwd(), ".github", "workflows");
  const workflowPath = join(workflowDir, "expect.yml");

  if (existsSync(workflowPath)) {
    if (!nonInteractive) {
      const response = await prompts({
        type: "confirm",
        name: "overwrite",
        message: `${highlighter.warn(".github/workflows/expect.yml")} already exists. Overwrite?`,
        initial: false,
      });
      if (!response.overwrite) {
        logger.dim("  Skipped GitHub Actions setup.");
        return;
      }
    } else {
      logger.dim("  .github/workflows/expect.yml already exists, skipping.");
      return;
    }
  }

  const workflow = generateWorkflow(packageManager, devCommand, devUrl);
  mkdirSync(workflowDir, { recursive: true });
  writeFileSync(workflowPath, workflow);

  logger.break();
  logger.success("Created .github/workflows/expect.yml");
  logger.break();
  logger.log(`  Add ${highlighter.info("ANTHROPIC_API_KEY")} to your repository secrets:`);
  logger.break();
  logger.log(`  You can use the ${highlighter.info("gh")} CLI to add repository secrets:`);
  logger.log(
    `  ${highlighter.dim("claude setup-token")} ${highlighter.dim("# use Claude Code to generate a token, then paste it into ANTHROPIC_API_KEY")}`,
  );
  logger.log(
    `  ${highlighter.dim("gh secret set ANTHROPIC_API_KEY")} ${highlighter.dim("# for an Anthropic API key or a token from claude setup-token")}`,
  );
};
