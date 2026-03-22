const BLOCKED_CLAUDE_PROCESS_ENVIRONMENT_VARIABLES = [
  "CLAUDECODE",
  "NODE_OPTIONS",
  "VSCODE_INSPECTOR_OPTIONS",
];

export const buildClaudeProcessEnv = (
  envOverrides?: Record<string, string>,
): Record<string, string> => {
  const inheritedEnvironment: Record<string, string> = {};

  for (const [environmentVariableName, environmentVariableValue] of Object.entries(process.env)) {
    if (environmentVariableValue === undefined) continue;
    inheritedEnvironment[environmentVariableName] = environmentVariableValue;
  }

  const mergedEnvironment = {
    ...inheritedEnvironment,
    ...(envOverrides ?? {}),
  };

  for (const environmentVariableName of BLOCKED_CLAUDE_PROCESS_ENVIRONMENT_VARIABLES) {
    delete mergedEnvironment[environmentVariableName];
  }

  return mergedEnvironment;
};
