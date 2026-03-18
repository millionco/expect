import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentProviderSettings } from "@browser-tester/agent";
import { createClaudeModel, createCodexModel, createCursorModel } from "@browser-tester/agent";
import type { AgentProvider } from "./types";

const MODEL_FACTORIES: Record<AgentProvider, (settings: AgentProviderSettings) => LanguageModelV3> =
  {
    claude: createClaudeModel,
    codex: createCodexModel,
    cursor: createCursorModel,
  };

export const createAgentModel = (
  provider: AgentProvider,
  settings: AgentProviderSettings,
): LanguageModelV3 => MODEL_FACTORIES[provider](settings);
