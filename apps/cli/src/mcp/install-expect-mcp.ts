import * as os from "node:os";
import * as path from "node:path";
import { type SupportedAgent, toDisplayName } from "@expect/agent";
import { prompts } from "../utils/prompts";
import { highlighter } from "../utils/highlighter";
import { NPM_PACKAGE_NAME, EXPECT_MCP_SERVER_NAME } from "../constants";
import { detectNonInteractive } from "../commands/init-utils";
import { getNestedValue, isConfigRecord, setNestedValue } from "./config-utils";
import { type ConfigFormat, ConfigRecord, type McpServerConfig } from "./config-types";
import { readJsonConfig, writeJsonConfig } from "./json-config";
import { readTomlConfig, writeTomlConfig } from "./toml-config";

export type McpSupportedAgent = "claude" | "codex" | "copilot" | "cursor" | "gemini" | "opencode";

export type McpInstallScope = "global" | "project";

interface AgentMcpConfig {
  readonly globalConfigPath: string;
  readonly projectConfigPath: string;
  readonly globalConfigKey?: string;
  readonly projectConfigKey?: string;
  readonly format: ConfigFormat;
  readonly transformConfig?: (config: McpServerConfig, scope: McpInstallScope) => unknown;
}

interface AgentInstallFailure {
  readonly agent: McpSupportedAgent;
  readonly reason: string;
}

export interface ExpectMcpInstallSummary {
  readonly scope: McpInstallScope;
  readonly selectedAgents: readonly McpSupportedAgent[];
  readonly installed: readonly McpSupportedAgent[];
  readonly updated: readonly McpSupportedAgent[];
  readonly alreadyInstalled: readonly McpSupportedAgent[];
  readonly failed: readonly AgentInstallFailure[];
}

interface InstallExpectMcpOptions {
  readonly scope?: McpInstallScope;
  readonly version?: string;
}

const HOME_DIRECTORY = os.homedir();
// HACK: process.env for XDG/Codex paths — these are OS-level conventions, not app configuration
const XDG_CONFIG_DIRECTORY = process.env.XDG_CONFIG_HOME ?? path.join(HOME_DIRECTORY, ".config");
const CODEX_CONFIG_DIRECTORY = process.env.CODEX_HOME ?? path.join(HOME_DIRECTORY, ".codex");
const COPILOT_CONFIG_DIRECTORY = path.join(HOME_DIRECTORY, ".copilot");

const transformOpenCodeConfig = (config: McpServerConfig): ConfigRecord => {
  const transformedConfig: ConfigRecord = {
    type: "local",
    command: [config.command, ...config.args],
    enabled: true,
  };

  if (config.env !== undefined && Object.keys(config.env).length > 0) {
    transformedConfig["environment"] = config.env;
  }

  return transformedConfig;
};

const MCP_AGENT_CONFIGS: Record<McpSupportedAgent, AgentMcpConfig> = {
  claude: {
    globalConfigPath: path.join(HOME_DIRECTORY, ".claude.json"),
    projectConfigPath: ".mcp.json",
    globalConfigKey: "mcpServers",
    projectConfigKey: "mcpServers",
    format: "json",
  },
  codex: {
    globalConfigPath: path.join(CODEX_CONFIG_DIRECTORY, "config.toml"),
    projectConfigPath: ".codex/config.toml",
    globalConfigKey: "mcp_servers",
    projectConfigKey: "mcp_servers",
    format: "toml",
  },
  copilot: {
    globalConfigPath: path.join(COPILOT_CONFIG_DIRECTORY, "mcp-config.json"),
    projectConfigPath: ".vscode/mcp.json",
    globalConfigKey: "mcpServers",
    projectConfigKey: "servers",
    format: "json",
  },
  cursor: {
    globalConfigPath: path.join(HOME_DIRECTORY, ".cursor", "mcp.json"),
    projectConfigPath: ".cursor/mcp.json",
    globalConfigKey: "mcpServers",
    projectConfigKey: "mcpServers",
    format: "json",
  },
  gemini: {
    globalConfigPath: path.join(HOME_DIRECTORY, ".gemini", "settings.json"),
    projectConfigPath: ".gemini/settings.json",
    globalConfigKey: "mcpServers",
    projectConfigKey: "mcpServers",
    format: "json",
  },
  opencode: {
    globalConfigPath: path.join(XDG_CONFIG_DIRECTORY, "opencode", "opencode.json"),
    projectConfigPath: "opencode.json",
    globalConfigKey: "mcp",
    projectConfigKey: "mcp",
    format: "json",
    transformConfig: transformOpenCodeConfig,
  },
};

const isMcpSupportedAgent = (agent: SupportedAgent): agent is McpSupportedAgent =>
  Object.prototype.hasOwnProperty.call(MCP_AGENT_CONFIGS, agent);

const readConfig = (configPath: string, format: ConfigFormat): ConfigRecord =>
  format === "json" ? readJsonConfig(configPath) : readTomlConfig(configPath);

const writeConfig = (
  configPath: string,
  partialConfig: ConfigRecord,
  format: ConfigFormat,
  configKey: string,
): void => {
  if (format === "json") {
    writeJsonConfig(configPath, partialConfig, configKey);
    return;
  }

  writeTomlConfig(configPath, partialConfig);
};

const normalizeVersionSpecifier = (version?: string): string => {
  if (version === undefined || version.trim() === "") return "latest";
  const trimmedVersion = version.trim();
  if (/^v\d/.test(trimmedVersion)) return trimmedVersion.slice(1);
  return trimmedVersion;
};

export const formatExpectMcpVersion = (version?: string): string => {
  const versionSpecifier = normalizeVersionSpecifier(version);
  return /^\d+\.\d+\.\d+/.test(versionSpecifier) ? `v${versionSpecifier}` : versionSpecifier;
};

export const getExpectMcpPackageSpecifier = (version?: string): string =>
  `${NPM_PACKAGE_NAME}@${normalizeVersionSpecifier(version)}`;

export const buildExpectMcpServerConfig = (version?: string): McpServerConfig => ({
  command: "npx",
  args: ["-y", getExpectMcpPackageSpecifier(version), "mcp"],
});

export const getSupportedExpectMcpAgents = (
  agents: readonly SupportedAgent[],
): McpSupportedAgent[] => agents.filter(isMcpSupportedAgent);

export const getUnsupportedExpectMcpAgents = (
  agents: readonly SupportedAgent[],
): SupportedAgent[] => agents.filter((agent) => !isMcpSupportedAgent(agent));

export const selectExpectMcpInstallScope = async (
  yes: boolean | undefined,
): Promise<McpInstallScope> => {
  if (detectNonInteractive(yes ?? false)) return "global";

  const response = await prompts({
    type: "select",
    name: "scope",
    message: "Where should Expect MCP be installed?",
    choices: [
      {
        title: "Install globally (user level)",
        description: "Writes to your user-level agent config and works across projects",
        value: "global",
      },
      {
        title: "Install in this project",
        description: "Writes project MCP files like .cursor/mcp.json",
        value: "project",
      },
    ],
    initial: 0,
  });

  return response.scope === "project" ? "project" : "global";
};

export const selectExpectMcpAgents = async (
  agents: readonly SupportedAgent[],
  yes: boolean | undefined,
  scope: McpInstallScope,
): Promise<McpSupportedAgent[]> => {
  const supportedAgents = getSupportedExpectMcpAgents(agents);
  if (detectNonInteractive(yes ?? false)) return supportedAgents;
  if (supportedAgents.length === 0) return [];

  const response = await prompts({
    type: "multiselect",
    name: "agents",
    message:
      scope === "global"
        ? `Install the ${highlighter.info("expect")} MCP globally for:`
        : `Install the ${highlighter.info("expect")} MCP in this project for:`,
    choices: supportedAgents.map((agent) => ({
      title: toDisplayName(agent),
      value: agent,
      selected: true,
    })),
    instructions: false,
  });

  return Array.isArray(response.agents)
    ? response.agents.filter((agent): agent is McpSupportedAgent => isMcpSupportedAgent(agent))
    : [];
};

const getAgentConfigPath = (
  projectRoot: string,
  agent: McpSupportedAgent,
  scope: McpInstallScope,
): string => {
  const agentConfig = MCP_AGENT_CONFIGS[agent];
  return scope === "global"
    ? agentConfig.globalConfigPath
    : path.join(projectRoot, agentConfig.projectConfigPath);
};

const getAgentConfigKey = (agent: McpSupportedAgent, scope: McpInstallScope): string => {
  const agentConfig = MCP_AGENT_CONFIGS[agent];
  return scope === "global"
    ? (agentConfig.globalConfigKey ?? agentConfig.projectConfigKey ?? "mcpServers")
    : (agentConfig.projectConfigKey ?? agentConfig.globalConfigKey ?? "mcpServers");
};

const getExpectedAgentConfig = (
  agent: McpSupportedAgent,
  scope: McpInstallScope,
  version?: string,
): unknown => {
  const config = buildExpectMcpServerConfig(version);
  return MCP_AGENT_CONFIGS[agent].transformConfig?.(config, scope) ?? config;
};

const buildConfigPatch = (
  agent: McpSupportedAgent,
  scope: McpInstallScope,
  config: unknown,
): ConfigRecord => {
  const patch: ConfigRecord = {};
  setNestedValue(patch, getAgentConfigKey(agent, scope), {
    [EXPECT_MCP_SERVER_NAME]: config,
  });
  return patch;
};

const readInstalledAgentConfig = (
  projectRoot: string,
  agent: McpSupportedAgent,
  scope: McpInstallScope,
) => {
  const agentConfig = MCP_AGENT_CONFIGS[agent];
  const configPath = getAgentConfigPath(projectRoot, agent, scope);
  return getNestedValue(
    readConfig(configPath, agentConfig.format),
    getAgentConfigKey(agent, scope),
  );
};

const getInstalledExpectMcpEntry = (
  projectRoot: string,
  agent: McpSupportedAgent,
  scope: McpInstallScope,
): unknown => {
  const currentConfig = readInstalledAgentConfig(projectRoot, agent, scope);
  if (!isConfigRecord(currentConfig)) return undefined;
  return currentConfig[EXPECT_MCP_SERVER_NAME];
};

const stringifyConfig = (value: unknown): string => JSON.stringify(value);

export const detectInstalledExpectMcpAgents = (
  projectRoot: string,
  agents: readonly SupportedAgent[],
  scope: McpInstallScope,
): McpSupportedAgent[] =>
  getSupportedExpectMcpAgents(agents).filter(
    (agent) => getInstalledExpectMcpEntry(projectRoot, agent, scope) !== undefined,
  );

export const installExpectMcpForAgents = (
  projectRoot: string,
  agents: readonly McpSupportedAgent[],
  options: InstallExpectMcpOptions = {},
): ExpectMcpInstallSummary => {
  const scope = options.scope ?? "project";
  const installed: McpSupportedAgent[] = [];
  const updated: McpSupportedAgent[] = [];
  const alreadyInstalled: McpSupportedAgent[] = [];
  const failed: AgentInstallFailure[] = [];

  for (const agent of agents) {
    const agentConfig = MCP_AGENT_CONFIGS[agent];
    const configPath = getAgentConfigPath(projectRoot, agent, scope);
    const expectedConfig = getExpectedAgentConfig(agent, scope, options.version);
    const currentConfig = getInstalledExpectMcpEntry(projectRoot, agent, scope);
    const configKey = getAgentConfigKey(agent, scope);

    if (stringifyConfig(currentConfig) === stringifyConfig(expectedConfig)) {
      alreadyInstalled.push(agent);
      continue;
    }

    try {
      writeConfig(
        configPath,
        buildConfigPatch(agent, scope, expectedConfig),
        agentConfig.format,
        configKey,
      );

      if (currentConfig === undefined) {
        installed.push(agent);
      } else {
        updated.push(agent);
      }
    } catch (error) {
      failed.push({
        agent,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    scope,
    selectedAgents: [...agents],
    installed,
    updated,
    alreadyInstalled,
    failed,
  };
};

export const formatExpectMcpInstallSummary = (summary: ExpectMcpInstallSummary): string => {
  const parts: string[] = [];
  const scopeLabel = summary.scope === "global" ? "globally" : "in this project";

  if (summary.installed.length > 0) {
    parts.push(`installed ${scopeLabel} for ${summary.installed.map(toDisplayName).join(", ")}`);
  }

  if (summary.updated.length > 0) {
    parts.push(`updated ${scopeLabel} for ${summary.updated.map(toDisplayName).join(", ")}`);
  }

  if (summary.alreadyInstalled.length > 0) {
    parts.push(
      `already current ${scopeLabel} for ${summary.alreadyInstalled.map(toDisplayName).join(", ")}`,
    );
  }

  if (parts.length === 0) return "No MCP config changes were applied.";
  return `Expect MCP ${parts.join("; ")}.`;
};
