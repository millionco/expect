import { create } from "zustand";
import {
  checkoutBranch,
  ChangesFor,
  type CommitSummary,
  type TestPlan,
  type TestReport,
} from "@browser-tester/supervisor";
import type {
  AgentProvider,
  BrowserEnvironmentHints,
  EnvironmentOverrides,
} from "../utils/test-run-config.js";
import { FLOW_INPUT_HISTORY_LIMIT } from "../constants.js";
import type { ContextOption } from "../utils/context-options.js";
import { useNavigationStore } from "./use-navigation.js";
import { usePreferencesStore } from "./use-preferences.js";
import { queryClient } from "../query-client.js";

const getBrowserEnvironment = (overrides?: EnvironmentOverrides): BrowserEnvironmentHints => ({
  baseUrl: overrides?.baseUrl,
  headed: overrides?.headed,
  cookies: overrides?.cookies,
});

interface FlowSessionStore {
  changesFor: ChangesFor | null;
  selectedCommit: CommitSummary | null;
  flowInstruction: string;
  flowInstructionHistory: string[];
  planOrigin: "generated" | "saved" | null;
  generatedPlan: TestPlan | null;
  browserEnvironment: BrowserEnvironmentHints | null;
  resolvedPlanningProvider: AgentProvider | null;
  resolvedExecutionProvider: AgentProvider | null;
  planningError: string | null;
  latestRunReport: TestReport | null;
  autoSaveStatus: "idle" | "saving" | "saved" | "error";
  liveViewUrl: string | null;
  mainMenuOnAction: boolean;
  selectedContext: ContextOption | null;
  checkedOutBranch: string | null;
  checkedOutPrNumber: number | null;
  checkoutError: string | null;

  setMainMenuOnAction: (value: boolean) => void;
  selectContext: (context: ContextOption | null) => void;
  setLiveViewUrl: (url: string | null) => void;
  goBack: () => void;
  selectChangesFor: (changesFor: ChangesFor) => void;
  selectCommit: (commit: CommitSummary) => void;
  submitFlowInstruction: (instruction: string) => void;
  completePlanning: (result: { plan: TestPlan; environment: BrowserEnvironmentHints }) => void;
  failPlanning: (error: string) => void;
  updatePlan: (plan: TestPlan) => void;
  updateEnvironment: (environment: BrowserEnvironmentHints | null) => void;
  requestPlanApproval: () => void;
  approvePlan: () => void;
  completeTestingRun: (report: TestReport) => void;
  exitTesting: () => void;
  switchBranch: (branch: string, prNumber?: number | null) => void;
  clearCheckoutError: () => void;
}

const needsCookieConfirmation = (): boolean => false;

const RESET_PLAN_STATE = {
  generatedPlan: null,
  browserEnvironment: null,
  resolvedPlanningProvider: null,
  resolvedExecutionProvider: null,
  latestRunReport: null,
  autoSaveStatus: "idle" as const,
  liveViewUrl: null,
};

const RESET_FLOW_STATE = {
  ...RESET_PLAN_STATE,
  changesFor: null,
  selectedCommit: null,
  selectedContext: null,
  flowInstruction: "",
  planningError: null,
  planOrigin: null,
};

const rememberFlowInstruction = (history: string[], instruction: string): string[] => {
  if (!instruction) return history;
  return [instruction, ...history.filter((entry) => entry !== instruction)].slice(
    0,
    FLOW_INPUT_HISTORY_LIMIT,
  );
};

const setScreen = useNavigationStore.getState().setScreen;

export const useFlowSessionStore = create<FlowSessionStore>((set, get) => ({
  changesFor: null,
  selectedCommit: null,
  flowInstruction: "",
  flowInstructionHistory: [],
  planOrigin: null,
  generatedPlan: null,
  browserEnvironment: null,
  resolvedPlanningProvider: null,
  resolvedExecutionProvider: null,
  planningError: null,
  latestRunReport: null,
  autoSaveStatus: "idle",
  liveViewUrl: null,
  mainMenuOnAction: true,
  selectedContext: null,
  checkedOutBranch: null,
  checkedOutPrNumber: null,
  checkoutError: null,

  setMainMenuOnAction: (value) => set({ mainMenuOnAction: value }),
  selectContext: (context) => set({ selectedContext: context }),
  setLiveViewUrl: (url) => set({ liveViewUrl: url }),

  goBack: () => {
    const { screen } = useNavigationStore.getState();
    const { skipPlanning } = usePreferencesStore.getState();
    const { planOrigin } = get();

    if (screen === "review-plan") {
      setScreen(planOrigin === "saved" ? "saved-flow-picker" : "main");
      return;
    }
    if (screen === "planning") {
      setScreen("main");
      return;
    }
    if (screen === "cookie-sync-confirm") {
      setScreen(skipPlanning ? "main" : "review-plan");
      return;
    }
    if (screen === "results") {
      set(RESET_FLOW_STATE);
      setScreen("main");
      return;
    }
    if (screen !== "testing") {
      setScreen("main");
    }
  },

  selectChangesFor: (changesFor) => {
    set({
      ...RESET_PLAN_STATE,
      changesFor,
      selectedCommit: null,
      planOrigin: null,
    });
    setScreen("main");
  },

  selectCommit: (commit) => {
    set({
      ...RESET_PLAN_STATE,
      changesFor: ChangesFor.Commit({ hash: commit.hash }),
      selectedCommit: commit,
      planOrigin: null,
    });
    setScreen("main");
  },

  submitFlowInstruction: (instruction) => {
    const state = get();
    const { skipPlanning, environmentOverrides } = usePreferencesStore.getState();
    const flowInstructionHistory = rememberFlowInstruction(
      state.flowInstructionHistory,
      instruction,
    );

    if (!state.changesFor) {
      set({
        ...RESET_PLAN_STATE,
        flowInstruction: instruction,
        flowInstructionHistory,
        planningError: null,
        planOrigin: "generated",
      });
      setScreen("main");
      return;
    }

    if (skipPlanning) {
      set({
        ...RESET_PLAN_STATE,
        flowInstruction: instruction,
        flowInstructionHistory,
        planningError: null,
        planOrigin: "generated",
      });
      const browserEnvironment = getBrowserEnvironment(environmentOverrides);
      set({ browserEnvironment });
      setScreen(needsCookieConfirmation() ? "cookie-sync-confirm" : "testing");
      return;
    }

    set({
      ...RESET_PLAN_STATE,
      flowInstruction: instruction,
      flowInstructionHistory,
      planningError: null,
      planOrigin: "generated",
    });
    setScreen("planning");
  },

  completePlanning: (result) => {
    const { autoRunAfterPlanning } = usePreferencesStore.getState();
    set({
      generatedPlan: result.plan,
      browserEnvironment: result.environment,
    });
    setScreen(autoRunAfterPlanning ? "testing" : "review-plan");
  },

  failPlanning: (error) => set({ planningError: error }),

  updatePlan: (plan) => set({ generatedPlan: plan }),

  updateEnvironment: (environment) => set({ browserEnvironment: environment }),

  requestPlanApproval: () => {
    setScreen(needsCookieConfirmation() ? "cookie-sync-confirm" : "testing");
  },

  approvePlan: () => {
    setScreen("testing");
  },

  completeTestingRun: (report) => {
    set({ latestRunReport: report });
    setScreen("results");
  },

  exitTesting: () => {
    set(RESET_FLOW_STATE);
    setScreen("main");
  },

  switchBranch: (branch, prNumber) => {
    const success = checkoutBranch(process.cwd(), branch);
    if (success) {
      set({
        ...RESET_PLAN_STATE,
        changesFor: null,
        checkedOutBranch: branch,
        checkedOutPrNumber: prNumber ?? null,
        checkoutError: null,
        selectedCommit: null,
        planOrigin: null,
      });
      void queryClient.invalidateQueries({ queryKey: ["git-state"] });
      setScreen("main");
    } else {
      set({
        checkoutError: `Could not checkout "${branch}". You may have uncommitted changes or the branch may not exist locally.`,
      });
    }
  },

  clearCheckoutError: () => set({ checkoutError: null }),
}));
