import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentProviderSettings } from "@browser-tester/agent";
import {
  createAcpModel,
  createClaudeModel,
  createCodexModel,
  createCursorModel,
  isKnownAcpAgent,
  resolveAcpAgentCommand,
} from "@browser-tester/agent";
import type { AgentProvider, NativeAgentProvider } from "./types";

const NATIVE_FACTORIES: Record<
  NativeAgentProvider,
  (settings: AgentProviderSettings) => LanguageModelV3
> = {
  claude: createClaudeModel,
  codex: createCodexModel,
  cursor: createCursorModel,
};

const isNativeProvider = (provider: string): provider is NativeAgentProvider =>
  provider in NATIVE_FACTORIES;

export const createAgentModel = (
  provider: AgentProvider,
  settings: AgentProviderSettings,
): LanguageModelV3 => {
  if (isNativeProvider(provider)) return NATIVE_FACTORIES[provider](settings);

  const command = isKnownAcpAgent(provider) ? resolveAcpAgentCommand(provider) : undefined;

  return createAcpModel({ ...settings, command });
};
