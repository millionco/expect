export type LaunchedFrom = "cli" | "ci" | "agent";

const CI_ENVIRONMENT_VARIABLES = ["GITHUB_ACTIONS", "GITHUB_RUN_ID", "CI"];

const AGENT_ENVIRONMENT_VARIABLES = [
  "CLAUDECODE",
  "CURSOR_AGENT",
  "CODEX_CI",
  "OPENCODE",
  "PI_CODING_AGENT_DIR",
  "AMP_HOME",
  "AMI",
];

const PARENT_AGENT_ENV_MAP: ReadonlyArray<readonly [string, string]> = [
  ["CLAUDECODE", "claude_code"],
  ["CURSOR_AGENT", "cursor"],
  ["CODEX_CI", "codex"],
  ["OPENCODE", "opencode"],
  ["AMP_HOME", "amp"],
  ["AMI", "ami"],
];

export const detectParentAgent = (): string | undefined => {
  for (const [envVariable, agentName] of PARENT_AGENT_ENV_MAP) {
    if (Boolean(process.env[envVariable])) return agentName;
  }
  return undefined;
};

export const detectLaunchedFrom = (): LaunchedFrom => {
  if (CI_ENVIRONMENT_VARIABLES.some((envVariable) => Boolean(process.env[envVariable])))
    return "ci";
  if (AGENT_ENVIRONMENT_VARIABLES.some((envVariable) => Boolean(process.env[envVariable])))
    return "agent";
  return "cli";
};

export const isRunningInAgent = (): boolean =>
  [...CI_ENVIRONMENT_VARIABLES, ...AGENT_ENVIRONMENT_VARIABLES].some((envVariable) =>
    Boolean(process.env[envVariable]),
  );
