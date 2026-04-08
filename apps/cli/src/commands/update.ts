import { detectAvailableAgents, toDisplayName } from "@expect/agent";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { spinner } from "../utils/spinner";
import { resolveProjectRoot } from "../utils/project-root";
import {
  detectInstalledExpectMcpAgents,
  formatExpectMcpInstallSummary,
  formatExpectMcpVersion,
  getSupportedExpectMcpAgents,
  getUnsupportedExpectMcpAgents,
  installExpectMcpForAgents,
} from "../mcp/install-expect-mcp";

export const runUpdateCommand = async (version?: string) => {
  const availableAgents = detectAvailableAgents();
  const supportedMcpAgents = getSupportedExpectMcpAgents(availableAgents);
  const unsupportedMcpAgents = getUnsupportedExpectMcpAgents(availableAgents);
  const versionLabel = formatExpectMcpVersion(version);

  if (supportedMcpAgents.length === 0) {
    logger.break();
    logger.error(
      "No supported coding agent found for Expect MCP. Expect MCP currently supports Claude Code, Codex, GitHub Copilot, Gemini CLI, Cursor, and OpenCode.",
    );
    process.exitCode = 1;
    return;
  }

  if (unsupportedMcpAgents.length > 0) {
    logger.break();
    logger.warn(
      `  Skipping MCP update for ${unsupportedMcpAgents.map(toDisplayName).join(", ")}.`,
    );
  }

  const projectRoot = await resolveProjectRoot();
  const installedAgents = detectInstalledExpectMcpAgents(projectRoot, supportedMcpAgents);
  const targetAgents = installedAgents.length > 0 ? installedAgents : supportedMcpAgents;

  logger.break();
  const updateSpinner = spinner(`Updating Expect MCP to ${versionLabel}...`).start();
  const installSummary = installExpectMcpForAgents(projectRoot, targetAgents, version);

  if (
    installSummary.selectedAgents.length > 0 &&
    installSummary.failed.length === installSummary.selectedAgents.length
  ) {
    updateSpinner.fail(`Failed to update Expect MCP to ${versionLabel}.`);
    for (const failure of installSummary.failed) {
      logger.warn(`  ${toDisplayName(failure.agent)}: ${failure.reason}`);
    }
    logger.dim(
      `  Re-run ${highlighter.info("expect init")} to recreate the project MCP config if needed.`,
    );
    process.exitCode = 1;
    return;
  }

  updateSpinner.succeed(formatExpectMcpInstallSummary(installSummary));

  if (installedAgents.length === 0) {
    logger.dim("  No existing Expect MCP config was found, so it was installed for detected agents.");
  }

  for (const failure of installSummary.failed) {
    logger.warn(`  ${toDisplayName(failure.agent)}: ${failure.reason}`);
  }
};
