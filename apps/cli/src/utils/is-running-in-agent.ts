const AGENT_ENVIRONMENT_VARIABLES = [
  "CI",
  "CLAUDECODE",
  "CURSOR_AGENT",
  "CODEX_CI",
  "OPENCODE",
  "AMP_HOME",
  "AMI",
];

export const isRunningInAgent = (): boolean =>
  AGENT_ENVIRONMENT_VARIABLES.some((envVariable) => Boolean(process.env[envVariable]));
