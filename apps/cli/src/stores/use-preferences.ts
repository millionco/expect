import { create } from "zustand";
import type { AgentProvider, EnvironmentOverrides } from "../utils/test-run-config.js";

interface PreferencesStore {
  autoRunAfterPlanning: boolean;
  skipPlanning: boolean;
  autoSaveFlows: boolean;
  planningProvider: AgentProvider | undefined;
  executionProvider: AgentProvider | undefined;
  planningModel: string | undefined;
  executionModel: string | undefined;
  environmentOverrides: EnvironmentOverrides | undefined;
  toggleAutoRun: () => void;
  toggleSkipPlanning: () => void;
  toggleAutoSave: () => void;
}

export const usePreferencesStore = create<PreferencesStore>((set) => ({
  autoRunAfterPlanning: false,
  skipPlanning: true,
  autoSaveFlows: true,
  planningProvider: undefined,
  executionProvider: undefined,
  planningModel: undefined,
  executionModel: undefined,
  environmentOverrides: undefined,
  toggleAutoRun: () => set((state) => ({ autoRunAfterPlanning: !state.autoRunAfterPlanning })),
  toggleSkipPlanning: () => set((state) => ({ skipPlanning: !state.skipPlanning })),
  toggleAutoSave: () => set((state) => ({ autoSaveFlows: !state.autoSaveFlows })),
}));
