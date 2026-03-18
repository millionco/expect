import { create } from "zustand";
import {
  checkoutBranch,
  createDirectRunPlan,
  getBrowserEnvironment,
  resolveBrowserTarget,
  type AgentProvider,
  type BrowserEnvironmentHints,
  type BrowserFlowPlan,
  type BrowserRunReport,
  type CommitSummary,
  type LoadedSavedFlow,
  type TestAction,
  type TestTarget,
} from "@browser-tester/supervisor";
import { FLOW_INPUT_HISTORY_LIMIT } from "../constants";
import type { ContextOption } from "../utils/context-options";
import { useNavigationStore } from "./use-navigation";
import { usePreferencesStore } from "./use-preferences";
import { queryClient } from "../query-client";

interface FlowSessionStore {
  testAction: TestAction | null;
  selectedCommit: CommitSummary | null;
  flowInstruction: string;
  flowInstructionHistory: string[];
  planOrigin: "generated" | "saved" | null;
  generatedPlan: BrowserFlowPlan | null;
  resolvedTarget: TestTarget | null;
  browserEnvironment: BrowserEnvironmentHints | null;
  resolvedPlanningProvider: AgentProvider | null;
  resolvedExecutionProvider: AgentProvider | null;
  planningError: string | null;
  pendingSavedFlow: LoadedSavedFlow | null;
  latestRunReport: BrowserRunReport | null;
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
  selectAction: (action: TestAction) => void;
  selectCommit: (commit: CommitSummary) => void;
  beginSavedFlowReuse: (action: TestAction) => void;
  applySavedFlow: (savedFlow: LoadedSavedFlow) => void;
  submitFlowInstruction: (instruction: string) => void;
  completePlanning: (result: {
    target: TestTarget;
    plan: BrowserFlowPlan;
    environment: BrowserEnvironmentHints;
  }) => void;
  failPlanning: (error: string) => void;
  updatePlan: (plan: BrowserFlowPlan) => void;
  updateEnvironment: (environment: BrowserEnvironmentHints | null) => void;
  requestPlanApproval: () => void;
  approvePlan: () => void;
  completeTestingRun: (report: BrowserRunReport) => void;
  exitTesting: () => void;
  switchBranch: (branch: string, prNumber?: number | null) => void;
  clearCheckoutError: () => void;
}

const needsCookieConfirmation = (
  plan: BrowserFlowPlan | null,
  environment: BrowserEnvironmentHints | null,
): boolean => Boolean(plan?.cookieSync.required) && environment?.cookies !== true;

const RESET_PLAN_STATE = {
  generatedPlan: null,
  resolvedTarget: null,
  browserEnvironment: null,
  resolvedPlanningProvider: null,
  resolvedExecutionProvider: null,
  pendingSavedFlow: null,
  latestRunReport: null,
  autoSaveStatus: "idle" as const,
  liveViewUrl: null,
};

const RESET_FLOW_STATE = {
  ...RESET_PLAN_STATE,
  testAction: null,
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
  testAction: null,
  selectedCommit: null,
  flowInstruction: "",
  flowInstructionHistory: [],
  planOrigin: null,
  generatedPlan: null,
  resolvedTarget: null,
  browserEnvironment: null,
  resolvedPlanningProvider: null,
  resolvedExecutionProvider: null,
  planningError: null,
  pendingSavedFlow: null,
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
    if (screen === "saved-flow-picker") {
      set({
        ...RESET_PLAN_STATE,
        testAction: null,
        selectedCommit: null,
        planOrigin: null,
      });
      setScreen("main");
      return;
    }
    if (screen !== "testing") {
      setScreen("main");
    }
  },

  selectAction: (action) => {
    set({
      ...RESET_PLAN_STATE,
      testAction: action,
      selectedCommit: null,
      planOrigin: null,
    });
    setScreen("main");
  },

  selectCommit: (commit) => {
    const state = get();
    if (state.pendingSavedFlow) {
      const { environmentOverrides } = usePreferencesStore.getState();
      set({
        testAction: "select-commit",
        selectedCommit: commit,
        generatedPlan: state.pendingSavedFlow.plan,
        resolvedTarget: resolveBrowserTarget({
          action: "select-commit",
          commit,
        }),
        browserEnvironment: {
          ...getBrowserEnvironment(environmentOverrides),
          ...state.pendingSavedFlow.environment,
        },
        pendingSavedFlow: null,
      });
      setScreen("review-plan");
      return;
    }

    set({
      ...RESET_PLAN_STATE,
      testAction: "select-commit",
      selectedCommit: commit,
      planOrigin: null,
    });
    setScreen("main");
  },

  beginSavedFlowReuse: (action) => {
    set({
      ...RESET_PLAN_STATE,
      testAction: action,
      selectedCommit: null,
      planningError: null,
      planOrigin: "saved",
    });
    setScreen("saved-flow-picker");
  },

  applySavedFlow: (savedFlow) => {
    const state = get();
    if (!state.testAction) return;

    const { environmentOverrides } = usePreferencesStore.getState();
    set({
      generatedPlan: savedFlow.plan,
      resolvedTarget: resolveBrowserTarget({ action: state.testAction }),
      browserEnvironment: {
        ...getBrowserEnvironment(environmentOverrides),
        ...savedFlow.environment,
      },
      pendingSavedFlow: null,
      selectedCommit: null,
    });
    setScreen("review-plan");
  },

  submitFlowInstruction: (instruction) => {
    const state = get();
    const { skipPlanning, environmentOverrides } = usePreferencesStore.getState();
    const flowInstructionHistory = rememberFlowInstruction(
      state.flowInstructionHistory,
      instruction,
    );

    if (!state.testAction) {
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
      const resolvedTarget = resolveBrowserTarget({
        action: state.testAction,
        commit: state.selectedCommit ?? undefined,
      });
      const browserEnvironment = getBrowserEnvironment(environmentOverrides);
      const directPlan = createDirectRunPlan({
        userInstruction: instruction,
        target: resolvedTarget,
      });

      set({
        ...RESET_PLAN_STATE,
        flowInstruction: instruction,
        flowInstructionHistory,
        planningError: null,
        planOrigin: "generated",
        resolvedTarget,
        generatedPlan: directPlan,
        browserEnvironment,
      });
      setScreen(
        needsCookieConfirmation(directPlan, browserEnvironment) ? "cookie-sync-confirm" : "testing",
      );
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
      resolvedTarget: result.target,
      generatedPlan: result.plan,
      browserEnvironment: result.environment,
    });
    setScreen(autoRunAfterPlanning && !result.plan.cookieSync.required ? "testing" : "review-plan");
  },

  failPlanning: (error) => set({ planningError: error }),

  updatePlan: (plan) => set({ generatedPlan: plan }),

  updateEnvironment: (environment) => set({ browserEnvironment: environment }),

  requestPlanApproval: () => {
    const { generatedPlan, browserEnvironment } = get();
    setScreen(
      needsCookieConfirmation(generatedPlan, browserEnvironment)
        ? "cookie-sync-confirm"
        : "testing",
    );
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
        testAction: "test-branch",
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
