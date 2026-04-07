import * as fs from "node:fs";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect } from "effect";
import { detectAvailableAgents, type SupportedAgent } from "@expect/agent";
import { detectProject } from "@expect/supervisor/detect-project";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { prompts } from "../utils/prompts";
import {
  type PackageManager,
  detectNonInteractive,
  detectPackageManager,
  generateClaudeToken,
  hasGhCli,
  isGithubCliAuthenticated,
  setGhSecret,
} from "./init-utils";

interface AddGithubActionOptions {
  yes?: boolean;
  agents?: SupportedAgent[];
}

const DEV_COMMAND_DEFAULTS: Record<PackageManager, string> = {
  npm: "npm run dev",
  pnpm: "pnpm dev",
  yarn: "yarn dev",
  bun: "bun dev",
  deno: "deno task dev",
  vp: "vp dev",
};

const DLX_COMMANDS: Record<PackageManager, string> = {
  npm: "npx",
  pnpm: "pnpm dlx",
  yarn: "npx",
  bun: "bunx",
  deno: "deno run -A npm:",
  vp: "npx",
};

const INSTALL_COMMANDS: Record<PackageManager, string> = {
  npm: "npm ci",
  pnpm: "pnpm install --frozen-lockfile",
  yarn: "yarn install --frozen-lockfile",
  bun: "bun install --frozen-lockfile",
  deno: "deno install",
  vp: "npm ci",
};

const generateWorkflow = (packageManager: PackageManager, devCommand: string, devUrl: string) => {
  const dlx = DLX_COMMANDS[packageManager];
  const install = INSTALL_COMMANDS[packageManager];

  const setupSteps = buildSetupSteps(packageManager, install);

  return `# Runs Expect browser tests in CI on every pull request.
# Expect reads the PR diff, generates a test plan, and validates changes in a real browser.
name: Expect CI

on:
  pull_request:
    branches: [main]

jobs:
  expect:
    # Prevents forks and external contributors from consuming CI credits or accessing secrets.
    if: github.event.sender.permissions.write == true
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      pull-requests: write
    env:
      ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
      # Expect uses this local app URL as the browser test target in CI.
      # Override by setting the EXPECT_BASE_URL repository variable.
      EXPECT_BASE_URL: \${{ vars.EXPECT_BASE_URL || '${devUrl}' }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
${setupSteps}

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium webkit firefox

      # Expect runs against your dev server by default, not a production build or deployed preview.
      # To test a preview URL instead, set the EXPECT_BASE_URL repository variable to skip
      # local dev server startup entirely.
      - name: Start dev server
        if: \${{ !vars.EXPECT_BASE_URL }}
        run: ${devCommand} &

      - name: Wait for dev server
        run: npx wait-on $EXPECT_BASE_URL --timeout 60000

      - name: Run expect
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: ${dlx} expect-cli@latest --ci

      - name: Upload test artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: expect-test-results
          path: .expect/sessions/
          if-no-files-found: ignore
`;
};

const SETUP_TEMPLATES: Record<PackageManager, (install: string) => string> = {
  pnpm: (install) => `
      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: ${install}`,

  bun: (install) => `
      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: ${install}`,

  yarn: (install) => `
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: yarn

      - name: Install dependencies
        run: ${install}`,

  deno: (install) => `
      - uses: denoland/setup-deno@v2

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: ${install}`,

  npm: (install) => `
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: ${install}`,

  vp: (install) => `
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: ${install}`,
};

const buildSetupSteps = (packageManager: PackageManager, install: string) =>
  SETUP_TEMPLATES[packageManager](install);

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

  const workflowDir = path.join(process.cwd(), ".github", "workflows");
  const workflowPath = path.join(workflowDir, "expect.yml");

  if (fs.existsSync(workflowPath)) {
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
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(workflowPath, workflow);

  logger.break();
  logger.success("Created .github/workflows/expect.yml");
  logger.dim("  Expect will automatically test every pull request in CI.");
  logger.break();

  const ghAvailable = await Effect.runPromise(hasGhCli);
  const ghAuthed = ghAvailable && (await Effect.runPromise(isGithubCliAuthenticated));
  const agents = options.agents ?? detectAvailableAgents();
  const hasClaude = agents.includes("claude");

  if (ghAvailable && !ghAuthed) {
    logger.dim(
      `  ${highlighter.info("gh")} is installed but not authenticated. Run ${highlighter.info("gh auth login")} first.`,
    );
    logger.break();
  }

  let secretSet = false;

  if (ghAuthed && hasClaude && !nonInteractive) {
    const response = await prompts({
      type: "confirm",
      name: "generateToken",
      message: `Generate API token via ${highlighter.info("claude setup-token")} and set as ${highlighter.info("ANTHROPIC_API_KEY")} secret?`,
      initial: true,
    });

    if (response.generateToken) {
      logger.break();

      const tokenResult = await Effect.runPromise(
        generateClaudeToken.pipe(
          Effect.andThen((token) =>
            setGhSecret("ANTHROPIC_API_KEY", token).pipe(
              Effect.as({ status: "secret-set" as const }),
            ),
          ),
          Effect.provide(NodeServices.layer),
          Effect.catchTag("ClaudeTokenGenerateError", (error) =>
            Effect.succeed({ status: "token-failed" as const, reason: error.reason }),
          ),
          Effect.catchTag("GhSecretSetError", (error) =>
            Effect.succeed({
              status: "secret-failed" as const,
              reason: error.reason,
            }),
          ),
        ),
      );

      logger.break();

      if (tokenResult.status === "secret-set") {
        logger.success("ANTHROPIC_API_KEY secret set.");
        secretSet = true;
      } else if (tokenResult.status === "token-failed") {
        logger.warn(`Could not generate token: ${tokenResult.reason}`);
        logger.log(
          `  You can set it manually: ${highlighter.dim("gh secret set ANTHROPIC_API_KEY")}`,
        );
      } else {
        logger.warn("Token generated but failed to set secret via gh.");
        if (tokenResult.reason) {
          logger.dim(`  ${tokenResult.reason}`);
        }
        logger.log(
          `  You can set it manually: ${highlighter.dim("gh secret set ANTHROPIC_API_KEY")}`,
        );
      }
    }
  }

  if (!secretSet) {
    logManualInstructions(ghAvailable, "ANTHROPIC_API_KEY", "secret");
  }
};

const logManualInstructions = (ghAvailable: boolean, name: string, kind: "secret" | "variable") => {
  const ghCommand = kind === "secret" ? "gh secret set" : "gh variable set";
  logger.log(`  Add ${highlighter.info(name)} to your repository ${kind}s:`);
  logger.break();
  if (ghAvailable) {
    logger.log(`  ${highlighter.dim(`${ghCommand} ${name}`)}`);
  } else {
    logger.log(`  Install the ${highlighter.info("gh")} CLI, then run:`);
    logger.log(`  ${highlighter.dim(`${ghCommand} ${name}`)}`);
    logger.break();
    logger.log(
      `  Or add it at ${highlighter.dim(`https://github.com/<owner>/<repo>/settings/${kind}s/actions`)}`,
    );
  }
};
