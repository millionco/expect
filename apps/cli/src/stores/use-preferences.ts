import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { promptHistoryStorage } from "@expect/supervisor";
import type { AgentBackend } from "@expect/agent";
import { FLOW_INPUT_HISTORY_LIMIT } from "../constants";

interface PreferencesStore {
  agentBackend: AgentBackend;
  browserHeaded: boolean;
  replayHost: string;
  autoSaveFlows: boolean;
  notifications: boolean | undefined;
  instructionHistory: string[];
  modelPreferences: Record<AgentBackend, { configId: string; value: string } | undefined>;
  setAgentBackend: (backend: AgentBackend) => void;
  setModelPreference: (agent: AgentBackend, configId: string, modelValue: string) => void;
  toggleAutoSave: () => void;
  toggleNotifications: () => void;
  rememberInstruction: (instruction: string) => void;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      agentBackend: "claude",
      browserHeaded: false,
      replayHost: "https://expect.dev",
      autoSaveFlows: true,
      notifications: undefined,
      instructionHistory: [],
      modelPreferences: {
        claude: undefined,
        codex: undefined,
        copilot: undefined,
        gemini: undefined,
        cursor: undefined,
        opencode: undefined,
        droid: undefined,
      },
      setAgentBackend: (backend: AgentBackend) => set({ agentBackend: backend }),
      setModelPreference: (agent: AgentBackend, configId: string, modelValue: string) =>
        set((state) => ({
          modelPreferences: { ...state.modelPreferences, [agent]: { configId, value: modelValue } },
        })),
      toggleAutoSave: () => set((state) => ({ autoSaveFlows: !state.autoSaveFlows })),
      toggleNotifications: () =>
        set((state) => ({ notifications: state.notifications === true ? false : true })),
      rememberInstruction: (instruction) => {
        if (!instruction) return;
        set((state) => ({
          instructionHistory: [
            instruction,
            ...state.instructionHistory.filter((entry) => entry !== instruction),
          ].slice(0, FLOW_INPUT_HISTORY_LIMIT),
        }));
      },
    }),
    {
      name: "prompt-history",
      storage: createJSONStorage(() => promptHistoryStorage),
      partialize: (state) => ({
        agentBackend: state.agentBackend,
        instructionHistory: state.instructionHistory,
        notifications: state.notifications,
        modelPreferences: state.modelPreferences,
      }),
    },
  ),
);
