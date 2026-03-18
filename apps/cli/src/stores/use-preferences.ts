import { create } from "zustand";
import type { AgentProvider, EnvironmentOverrides } from "../utils/test-run-config.js";

interface PreferencesStore {
  executionProvider: AgentProvider | undefined;
  executionModel: string | undefined;
  environmentOverrides: EnvironmentOverrides | undefined;
}

export const usePreferencesStore = create<PreferencesStore>(() => ({
  executionProvider: undefined,
  executionModel: undefined,
  environmentOverrides: undefined,
}));
