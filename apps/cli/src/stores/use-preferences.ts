import { Effect } from "effect";
import { NodeServices } from "@effect/platform-node";
import { create } from "zustand";
import type { AgentProvider, EnvironmentOverrides } from "@browser-tester/supervisor";
import { savePreferences } from "../utils/load-preferences";

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
  toggleSkipPlanning: () =>
    set((state) => {
      const nextValue = !state.skipPlanning;
      void Effect.runPromise(
        savePreferences({ skipPlanning: nextValue }).pipe(
          Effect.provide(NodeServices.layer),
          Effect.catchTag("PreferencesWriteError", () => Effect.void),
        ),
      );
      return { skipPlanning: nextValue };
    }),
  toggleAutoSave: () => set((state) => ({ autoSaveFlows: !state.autoSaveFlows })),
}));
