import { create } from "zustand";
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
}

export const usePreferencesStore = create<PreferencesStore>((set) => ({
  autoRunAfterPlanning: false,
  skipPlanning: true,
  autoSaveFlows: true,
  instructionHistory: [],
  toggleAutoRun: () => set((state) => ({ autoRunAfterPlanning: !state.autoRunAfterPlanning })),
  toggleSkipPlanning: () => set((state) => ({ skipPlanning: !state.skipPlanning })),
  toggleAutoSave: () => set((state) => ({ autoSaveFlows: !state.autoSaveFlows })),
  rememberInstruction: (instruction) =>
    set((state) => {
      if (!instruction) return state;
      return {
        instructionHistory: [
          instruction,
          ...state.instructionHistory.filter((entry) => entry !== instruction),
        ].slice(0, FLOW_INPUT_HISTORY_LIMIT),
      };
    }),
}));
