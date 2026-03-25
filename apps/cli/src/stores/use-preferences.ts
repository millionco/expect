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
  setAgentBackend: (backend: AgentBackend) => void;
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
      setAgentBackend: (backend: AgentBackend) => set({ agentBackend: backend }),
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
        instructionHistory: state.instructionHistory,
        notifications: state.notifications,
      }),
    },
  ),
);
