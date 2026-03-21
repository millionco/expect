import { create } from "zustand";
import { loadPromptHistory, appendPrompt } from "@browser-tester/supervisor";
import { FLOW_INPUT_HISTORY_LIMIT } from "../constants.js";

interface PreferencesStore {
  autoRunAfterPlanning: boolean;
  skipPlanning: boolean;
  autoSaveFlows: boolean;
  instructionHistory: string[];
  toggleAutoRun: () => void;
  toggleSkipPlanning: () => void;
  toggleAutoSave: () => void;
  rememberInstruction: (instruction: string) => void;
  hydrateHistory: () => void;
}

export const usePreferencesStore = create<PreferencesStore>((set) => ({
  autoRunAfterPlanning: false,
  skipPlanning: true,
  autoSaveFlows: true,
  instructionHistory: [],
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
    appendPrompt(instruction).catch(() => {});
  },
  hydrateHistory: () => {
    loadPromptHistory()
      .then((history) => set({ instructionHistory: history.slice(0, FLOW_INPUT_HISTORY_LIMIT) }))
      .catch(() => {});
  },
}));
