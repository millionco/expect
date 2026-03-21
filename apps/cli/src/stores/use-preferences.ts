import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { promptHistoryStorage } from "@browser-tester/supervisor";
import type { AgentBackend } from "@browser-tester/agent";
import { FLOW_INPUT_HISTORY_LIMIT } from "../constants.js";

interface PreferencesStore {
  agentBackend: AgentBackend;
  autoRunAfterPlanning: boolean;
  skipPlanning: boolean;
  autoSaveFlows: boolean;
  instructionHistory: string[];
  setAgentBackend: (backend: AgentBackend) => void;
  toggleAutoRun: () => void;
  toggleSkipPlanning: () => void;
  toggleAutoSave: () => void;
  rememberInstruction: (instruction: string) => void;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      agentBackend: "codex" as AgentBackend,
      autoRunAfterPlanning: false,
      skipPlanning: true,
      autoSaveFlows: true,
      instructionHistory: [],
      setAgentBackend: (backend: AgentBackend) => set({ agentBackend: backend }),
      toggleAutoRun: () => set((state) => ({ autoRunAfterPlanning: !state.autoRunAfterPlanning })),
      toggleSkipPlanning: () => set((state) => ({ skipPlanning: !state.skipPlanning })),
      toggleAutoSave: () => set((state) => ({ autoSaveFlows: !state.autoSaveFlows })),
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
      partialize: (state) => ({ instructionHistory: state.instructionHistory }),
    },
  ),
);
