import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentBackend, SupportedAgent } from "@expect/agent";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { prompts } from "../utils/prompts";
import { type PackageManager, detectNonInteractive, detectPackageManager } from "./init-utils";

interface AddGithubActionOptions {
  yes?: boolean;
  agent?: AgentBackend;
  availableAgents?: readonly SupportedAgent[];
}

const DEV_COMMAND_DEFAULTS: Record<PackageManager, string> = {
  npm: "npm run dev",
  pnpm: "pnpm dev",
  yarn: "yarn dev",
  bun: "bun dev",
  vp: "vp dev",
};

const DEFAULT_DEV_URL = "http://localhost:3000";

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

const GITHUB_ACTION_AGENTS: readonly AgentBackend[] = ["claude", "codex"];

const GITHUB_ACTION_AGENT_LABELS: Record<AgentBackend, string> = {
  claude: "Claude",
  codex: "Codex",
};

const GITHUB_ACTION_AGENT_SECRETS: Record<AgentBackend, string> = {
  claude: "ANTHROPIC_API_KEY",
  codex: "OPENAI_API_KEY",
};

const isGithubActionAgent = (agent: SupportedAgent): agent is AgentBackend =>
  agent === "claude" || agent === "codex";

const getDefaultGithubActionAgent = (
  availableAgents: readonly SupportedAgent[] = [],
): AgentBackend => {
  const detectedAgent = availableAgents.find(isGithubActionAgent);
  return detectedAgent ?? "claude";
};

const generateWorkflow = (
  packageManager: PackageManager,
  devCommand: string,
  devUrl: string,
  agent: AgentBackend,
) => {
  const dlx = DLX_COMMANDS[packageManager];
  const install = INSTALL_COMMANDS[packageManager];
  const secretName = GITHUB_ACTION_AGENT_SECRETS[agent];

  const setupSteps = buildSetupSteps(packageManager);

  return `name: Expect Tests

on:
  pull_request:
    branches: [main]

jobs:
  expect:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      ${secretName}: \${{ secrets.${secretName} }}
      EXPECT_BASE_URL: "${devUrl}"
    steps:
      - uses: actions/checkout@v4
${setupSteps}
      - name: Install dependencies
        run: ${install}

      - name: Start dev server
        run: ${devCommand} &

      - name: Wait for dev server
        run: npx wait-on ${devUrl} --timeout 60000

      - name: Run expect
        run: ${dlx} expect-cli@latest --ci --agent ${agent}
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
  const defaultAgent = getDefaultGithubActionAgent(options.availableAgents);

  let devCommand = DEV_COMMAND_DEFAULTS[packageManager];
  let devUrl = DEFAULT_DEV_URL;
  let agent = options.agent ?? defaultAgent;

  if (!nonInteractive) {
    const providerQuestion =
      options.agent === undefined
        ? [
            {
              type: "select" as const,
              name: "agent",
              message: "GitHub Actions agent provider:",
              initial: GITHUB_ACTION_AGENTS.indexOf(defaultAgent),
              choices: GITHUB_ACTION_AGENTS.map((provider) => ({
                title: GITHUB_ACTION_AGENT_LABELS[provider],
                value: provider,
                description: GITHUB_ACTION_AGENT_SECRETS[provider],
              })),
            },
          ]
        : [];

    const responses = await prompts([
      ...providerQuestion,
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
    agent = responses.agent || agent;
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

  const workflow = generateWorkflow(packageManager, devCommand, devUrl, agent);
  mkdirSync(workflowDir, { recursive: true });
  writeFileSync(workflowPath, workflow);

  logger.break();
  logger.success(`Created .github/workflows/expect.yml for ${GITHUB_ACTION_AGENT_LABELS[agent]}`);
  logger.break();
  logger.log(
    `  Add ${highlighter.info(GITHUB_ACTION_AGENT_SECRETS[agent])} to your repository secrets:`,
  );
  logger.log(
    `  ${highlighter.dim("Settings → Secrets and variables → Actions → New repository secret")}`,
  );
};
