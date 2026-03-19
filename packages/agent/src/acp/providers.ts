interface AcpAgentDescriptor {
  readonly command: string;
  readonly displayName: string;
}

const ACP_AGENTS = {
  gemini: { command: "gemini", displayName: "Gemini CLI" },
  opencode: { command: "opencode", displayName: "OpenCode" },
  goose: { command: "goose", displayName: "Goose" },
  copilot: { command: "copilot", displayName: "GitHub Copilot" },
  kiro: { command: "kiro", displayName: "Kiro CLI" },
  cline: { command: "cline", displayName: "Cline" },
  openhands: { command: "openhands", displayName: "OpenHands" },
  augment: { command: "augment", displayName: "Augment Code" },
} as const satisfies Record<string, AcpAgentDescriptor>;

export type AcpAgentName = keyof typeof ACP_AGENTS;

export const isKnownAcpAgent = (name: string): name is AcpAgentName => name in ACP_AGENTS;

export const resolveAcpAgentCommand = (name: AcpAgentName): string => ACP_AGENTS[name].command;

export const resolveAcpAgentDisplayName = (name: AcpAgentName): string =>
  ACP_AGENTS[name].displayName;
