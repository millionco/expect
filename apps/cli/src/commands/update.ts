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
  type McpInstallScope,
} from "../mcp/install-expect-mcp";

export const runUpdateCommand = async (version?: string) => {
  const availableAgents = detectAvailableAgents();
  const supportedMcpAgents = getSupportedExpectMcpAgents(availableAgents);
  const unsupportedMcpAgents = getUnsupportedExpectMcpAgents(availableAgents);
  const versionLabel = formatExpectMcpVersion(version);

  if (supportedMcpAgents.length === 0) {
    logger.break();
    logger.error(
      "No supported coding agent found for Expect MCP. Expect MCP currently supports Claude Code, Codex, GitHub Copilot, Gemini CLI, Cursor, OpenCode, and Pi.",
    );
    process.exitCode = 1;
    return;
  }

  if (unsupportedMcpAgents.length > 0) {
    logger.break();
    logger.warn(`  Skipping MCP update for ${unsupportedMcpAgents.map(toDisplayName).join(", ")}.`);
  }

  const projectRoot = await resolveProjectRoot();
  const summaries = [];
  const scopes: readonly McpInstallScope[] = ["global", "project"];
  let foundInstalledConfig = false;

  logger.break();
  const updateSpinner = spinner(`Updating Expect MCP to ${versionLabel}...`).start();

  for (const scope of scopes) {
    const installedAgents = detectInstalledExpectMcpAgents(projectRoot, supportedMcpAgents, scope);
    if (installedAgents.length === 0) continue;
    foundInstalledConfig = true;
    summaries.push(
      installExpectMcpForAgents(projectRoot, installedAgents, {
        scope,
        version,
      }),
    );
  }

  if (!foundInstalledConfig) {
    summaries.push(
      installExpectMcpForAgents(projectRoot, supportedMcpAgents, {
        scope: "global",
        version,
      }),
    );
  }

  const allSelected = summaries.flatMap((summary) => summary.selectedAgents);
  const allFailed = summaries.flatMap((summary) => summary.failed);

  if (allSelected.length > 0 && allFailed.length === allSelected.length) {
    updateSpinner.fail(`Failed to update Expect MCP to ${versionLabel}.`);
    for (const failure of allFailed) {
      logger.warn(`  ${toDisplayName(failure.agent)}: ${failure.reason}`);
    }
    logger.dim(
      `  Re-run ${highlighter.info("expect init")} to recreate the global or project MCP config if needed.`,
    );
    process.exitCode = 1;
    return;
  }

  updateSpinner.succeed(summaries.map(formatExpectMcpInstallSummary).join(" "));

  if (!foundInstalledConfig) {
    logger.dim(
      "  No existing Expect MCP config was found, so it was installed globally for detected agents.",
    );
  }

  for (const failure of allFailed) {
    logger.warn(`  ${toDisplayName(failure.agent)}: ${failure.reason}`);
  }
};
