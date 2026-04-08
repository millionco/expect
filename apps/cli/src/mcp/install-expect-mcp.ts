import * as path from "node:path";
import { type SupportedAgent, toDisplayName } from "@expect/agent";
import { prompts } from "../utils/prompts";
import { highlighter } from "../utils/highlighter";
import { EXPECT_MCP_PACKAGE_NAME, EXPECT_MCP_SERVER_NAME } from "../constants";
import { detectNonInteractive } from "../commands/init-utils";
import { getNestedValue, setNestedValue } from "./config-utils";
import { type ConfigFormat, ConfigRecord, type McpServerConfig } from "./config-types";
import { readJsonConfig, writeJsonConfig } from "./json-config";
import { readTomlConfig, writeTomlConfig } from "./toml-config";

export type McpSupportedAgent =
  | "claude"
  | "codex"
  | "copilot"
  | "cursor"
  | "gemini"
  | "opencode";

interface AgentMcpConfig {
  readonly configPath: string;
  readonly configKey: string;
  readonly format: ConfigFormat;
  readonly transformConfig?: (config: McpServerConfig) => unknown;
}

interface AgentInstallFailure {
  readonly agent: McpSupportedAgent;
  readonly reason: string;
}

export interface ExpectMcpInstallSummary {
  readonly selectedAgents: readonly McpSupportedAgent[];
  readonly installed: readonly McpSupportedAgent[];
  readonly updated: readonly McpSupportedAgent[];
  readonly alreadyInstalled: readonly McpSupportedAgent[];
  readonly failed: readonly AgentInstallFailure[];
}

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
    configPath: ".mcp.json",
    configKey: "mcpServers",
    format: "json",
  },
  codex: {
    configPath: ".codex/config.toml",
    configKey: "mcp_servers",
    format: "toml",
  },
  copilot: {
    configPath: ".vscode/mcp.json",
    configKey: "servers",
    format: "json",
  },
  cursor: {
    configPath: ".cursor/mcp.json",
    configKey: "mcpServers",
    format: "json",
  },
  gemini: {
    configPath: ".gemini/settings.json",
    configKey: "mcpServers",
    format: "json",
  },
  opencode: {
    configPath: "opencode.json",
    configKey: "mcp",
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
  `${EXPECT_MCP_PACKAGE_NAME}@${normalizeVersionSpecifier(version)}`;

export const buildExpectMcpServerConfig = (version?: string): McpServerConfig => ({
  command: "npx",
  args: ["-y", getExpectMcpPackageSpecifier(version)],
});

export const getSupportedExpectMcpAgents = (
  agents: readonly SupportedAgent[],
): McpSupportedAgent[] => agents.filter(isMcpSupportedAgent);

export const getUnsupportedExpectMcpAgents = (
  agents: readonly SupportedAgent[],
): SupportedAgent[] => agents.filter((agent) => !isMcpSupportedAgent(agent));

export const selectExpectMcpAgents = async (
  agents: readonly SupportedAgent[],
  yes: boolean | undefined,
): Promise<McpSupportedAgent[]> => {
  const supportedAgents = getSupportedExpectMcpAgents(agents);
  if (detectNonInteractive(yes ?? false)) return supportedAgents;
  if (supportedAgents.length === 0) return [];

  const response = await prompts({
    type: "multiselect",
    name: "agents",
    message: `Install the ${highlighter.info("expect")} MCP for:`,
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

const getAgentConfigPath = (projectRoot: string, agent: McpSupportedAgent): string =>
  path.join(projectRoot, MCP_AGENT_CONFIGS[agent].configPath);

const getExpectedAgentConfig = (agent: McpSupportedAgent, version?: string): unknown => {
  const config = buildExpectMcpServerConfig(version);
  return MCP_AGENT_CONFIGS[agent].transformConfig?.(config) ?? config;
};

const buildConfigPatch = (agent: McpSupportedAgent, config: unknown): ConfigRecord => {
  const patch: ConfigRecord = {};
  setNestedValue(patch, MCP_AGENT_CONFIGS[agent].configKey, {
    [EXPECT_MCP_SERVER_NAME]: config,
  });
  return patch;
};

const readInstalledAgentConfig = (
  projectRoot: string,
  agent: McpSupportedAgent,
): { configPath: string; currentConfig: unknown } => {
  const agentConfig = MCP_AGENT_CONFIGS[agent];
  const configPath = getAgentConfigPath(projectRoot, agent);
  const currentConfig = getNestedValue(readConfig(configPath, agentConfig.format), agentConfig.configKey);
  return { configPath, currentConfig };
};

const getInstalledExpectMcpEntry = (projectRoot: string, agent: McpSupportedAgent): unknown => {
  const { currentConfig } = readInstalledAgentConfig(projectRoot, agent);
  if (currentConfig === undefined || typeof currentConfig !== "object" || Array.isArray(currentConfig)) {
    return undefined;
  }

  return (currentConfig as ConfigRecord)[EXPECT_MCP_SERVER_NAME];
};

const stringifyConfig = (value: unknown): string => JSON.stringify(value);

export const detectInstalledExpectMcpAgents = (
  projectRoot: string,
  agents: readonly SupportedAgent[],
): McpSupportedAgent[] =>
  getSupportedExpectMcpAgents(agents).filter(
    (agent) => getInstalledExpectMcpEntry(projectRoot, agent) !== undefined,
  );

export const installExpectMcpForAgents = (
  projectRoot: string,
  agents: readonly McpSupportedAgent[],
  version?: string,
): ExpectMcpInstallSummary => {
  const installed: McpSupportedAgent[] = [];
  const updated: McpSupportedAgent[] = [];
  const alreadyInstalled: McpSupportedAgent[] = [];
  const failed: AgentInstallFailure[] = [];

  for (const agent of agents) {
    const agentConfig = MCP_AGENT_CONFIGS[agent];
    const configPath = getAgentConfigPath(projectRoot, agent);
    const expectedConfig = getExpectedAgentConfig(agent, version);
    const currentConfig = getInstalledExpectMcpEntry(projectRoot, agent);

    if (stringifyConfig(currentConfig) === stringifyConfig(expectedConfig)) {
      alreadyInstalled.push(agent);
      continue;
    }

    try {
      writeConfig(
        configPath,
        buildConfigPatch(agent, expectedConfig),
        agentConfig.format,
        agentConfig.configKey,
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
    selectedAgents: [...agents],
    installed,
    updated,
    alreadyInstalled,
    failed,
  };
};

export const formatExpectMcpInstallSummary = (summary: ExpectMcpInstallSummary): string => {
  const parts: string[] = [];

  if (summary.installed.length > 0) {
    parts.push(`installed for ${summary.installed.map(toDisplayName).join(", ")}`);
  }

  if (summary.updated.length > 0) {
    parts.push(`updated for ${summary.updated.map(toDisplayName).join(", ")}`);
  }

  if (summary.alreadyInstalled.length > 0) {
    parts.push(`already current for ${summary.alreadyInstalled.map(toDisplayName).join(", ")}`);
  }

  if (parts.length === 0) return "No MCP config changes were applied.";
  return `Expect MCP ${parts.join("; ")}.`;
};
