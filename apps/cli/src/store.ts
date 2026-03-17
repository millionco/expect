import { Effect } from "effect";
import { create } from "zustand";
import {
  checkoutBranch,
  type AgentProvider,
  type BrowserEnvironmentHints,
  type BrowserFlowPlan,
  type BrowserRunReport,
  type CommitSummary,
  type TestTarget,
} from "@browser-tester/supervisor";
import { FLOW_INPUT_HISTORY_LIMIT } from "./constants.js";
import {
  getBrowserEnvironment,
  resolveBrowserTarget,
  type TestAction,
} from "./utils/browser-agent.js";
import { getGitState, type GitState } from "./utils/get-git-state.js";
import type { ContextOption } from "./utils/context-options.js";
import { CliRuntime } from "./runtime.js";
import { createDirectRunPlan } from "./utils/create-direct-run-plan.js";
import {
  listSavedFlows,
  type LoadedSavedFlow,
  type SavedFlowSummary,
} from "./utils/flow-storage.js";
import type { EnvironmentOverrides } from "./utils/test-run-config.js";

export type Screen =
  | "main"
  | "select-pr"
  | "saved-flow-picker"
  | "planning"
  | "review-plan"
  | "cookie-sync-confirm"
  | "testing"
  | "results"
  | "theme";

interface AppStore {
  screen: Screen;
  previousScreen: Screen;
  gitState: GitState | null;
  testAction: TestAction | null;
  selectedCommit: CommitSummary | null;
  flowInstruction: string;
  flowInstructionHistory: string[];
  autoRunAfterPlanning: boolean;
  skipPlanning: boolean;
  planningProvider: AgentProvider | undefined;
  executionProvider: AgentProvider | undefined;
  planningModel: string | undefined;
  executionModel: string | undefined;
  resolvedPlanningProvider: AgentProvider | null;
  resolvedExecutionProvider: AgentProvider | null;
  generatedPlan: BrowserFlowPlan | null;
  resolvedTarget: TestTarget | null;
  browserEnvironment: BrowserEnvironmentHints | null;
  environmentOverrides: EnvironmentOverrides | undefined;
  planningError: string | null;
  planOrigin: "generated" | "saved" | null;
  savedFlowSummaries: SavedFlowSummary[];
  pendingSavedFlow: LoadedSavedFlow | null;
  mainMenuOnAction: boolean;
  checkedOutBranch: string | null;
  checkedOutPrNumber: number | null;
  checkoutError: string | null;
  selectedContext: ContextOption | null;
  latestRunReport: BrowserRunReport | null;
  autoSaveFlows: boolean;
  autoSaveStatus: "idle" | "saving" | "saved" | "error";
  liveViewUrl: string | null;

  setMainMenuOnAction: (value: boolean) => void;
  selectContext: (context: ContextOption | null) => void;
  setLiveViewUrl: (url: string | null) => void;
  loadGitState: () => void;
  loadSavedFlows: () => Promise<void>;
  goBack: () => void;
  navigateTo: (screen: Screen) => void;
  selectAction: (action: TestAction) => void;
  selectCommit: (commit: CommitSummary) => void;
  beginSavedFlowReuse: (action: TestAction) => void;
  applySavedFlow: (savedFlow: LoadedSavedFlow) => void;
  submitFlowInstruction: (instruction: string) => void;
  toggleAutoRun: () => void;
  toggleSkipPlanning: () => void;
  toggleAutoSave: () => void;
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
  environmentOverrides: undefined,
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

export const useAppStore = create<AppStore>((set) => ({
  screen: "main",
  previousScreen: "main",
  gitState: null,
  testAction: null,
  selectedCommit: null,
  flowInstruction: "",
  flowInstructionHistory: [],
  autoRunAfterPlanning: false,
  skipPlanning: true,
  planningProvider: undefined,
  executionProvider: undefined,
  planningModel: undefined,
  executionModel: undefined,
  resolvedPlanningProvider: null,
  resolvedExecutionProvider: null,
  generatedPlan: null,
  resolvedTarget: null,
  browserEnvironment: null,
  environmentOverrides: undefined,
  planningError: null,
  planOrigin: null,
  savedFlowSummaries: [],
  pendingSavedFlow: null,
  mainMenuOnAction: true,
  selectedContext: null,
  checkedOutBranch: null,
  checkedOutPrNumber: null,
  checkoutError: null,
  latestRunReport: null,
  autoSaveFlows: true,
  autoSaveStatus: "idle",
  liveViewUrl: null,

  setMainMenuOnAction: (value) => set({ mainMenuOnAction: value }),
  setLiveViewUrl: (url) => set({ liveViewUrl: url }),
  loadGitState: () => set({ gitState: getGitState() }),
  selectContext: (context) => set({ selectedContext: context }),

  loadSavedFlows: async () => {
    const savedFlowSummaries = await CliRuntime.runPromise(
      listSavedFlows().pipe(
        Effect.catchTag("FlowStorageError", () => Effect.succeed([] as SavedFlowSummary[])),
      ),
    );
    set({ savedFlowSummaries });
  },

  goBack: () =>
    set((state) => {
      if (state.screen === "review-plan") {
        return {
          screen: state.planOrigin === "saved" ? "saved-flow-picker" : "main",
        };
      }
      if (state.screen === "planning") {
        return { screen: "main" };
      }
      if (state.screen === "cookie-sync-confirm") {
        return { screen: "review-plan" };
      }
      if (state.screen === "results") {
        return {
          ...RESET_FLOW_STATE,
          screen: "main",
        };
      }
      if (state.screen === "saved-flow-picker") {
        return {
          ...RESET_PLAN_STATE,
          screen: "main",
          testAction: null,
          selectedCommit: null,
          planOrigin: null,
        };
      }
      if (state.screen !== "testing") {
        return { screen: "main" };
      }
      return {};
    }),

  navigateTo: (screen) => set((state) => ({ screen, previousScreen: state.screen })),

  selectAction: (action) =>
    set({
      ...RESET_PLAN_STATE,
      testAction: action,
      selectedCommit: null,
      planOrigin: null,
      screen: "main",
    }),

  selectCommit: (commit) =>
    set((state) => {
      if (state.pendingSavedFlow) {
        return {
          testAction: "select-commit",
          selectedCommit: commit,
          generatedPlan: state.pendingSavedFlow.plan,
          resolvedTarget: resolveBrowserTarget({
            action: "select-commit",
            commit,
          }),
          browserEnvironment: {
            ...getBrowserEnvironment(state.environmentOverrides),
            ...state.pendingSavedFlow.environment,
          },
          pendingSavedFlow: null,
          screen: "review-plan",
        };
      }

      return {
        ...RESET_PLAN_STATE,
        testAction: "select-commit",
        selectedCommit: commit,
        planOrigin: null,
        screen: "main",
      };
    }),

  beginSavedFlowReuse: (action) =>
    set({
      ...RESET_PLAN_STATE,
      testAction: action,
      selectedCommit: null,
      planningError: null,
      planOrigin: "saved",
      screen: "saved-flow-picker",
    }),

  applySavedFlow: (savedFlow) =>
    set((state) => {
      if (!state.testAction) {
        return {};
      }

      return {
        generatedPlan: savedFlow.plan,
        resolvedTarget: resolveBrowserTarget({ action: state.testAction }),
        browserEnvironment: {
          ...getBrowserEnvironment(state.environmentOverrides),
          ...savedFlow.environment,
        },
        pendingSavedFlow: null,
        selectedCommit: null,
        screen: "review-plan",
      };
    }),

  submitFlowInstruction: (instruction) =>
    set((state) => {
      const flowInstructionHistory = rememberFlowInstruction(
        state.flowInstructionHistory,
        instruction,
      );

      if (!state.testAction) {
        return {
          ...RESET_PLAN_STATE,
          flowInstruction: instruction,
          flowInstructionHistory,
          planningError: null,
          planOrigin: "generated",
          screen: "main",
        };
      }

      if (state.skipPlanning) {
        const resolvedTarget = resolveBrowserTarget({
          action: state.testAction,
          commit: state.selectedCommit ?? undefined,
        });
        const browserEnvironment = getBrowserEnvironment(state.environmentOverrides);

        return {
          ...RESET_PLAN_STATE,
          flowInstruction: instruction,
          flowInstructionHistory,
          planningError: null,
          planOrigin: "generated",
          resolvedTarget,
          generatedPlan: createDirectRunPlan({
            userInstruction: instruction,
            target: resolvedTarget,
          }),
          browserEnvironment,
          screen: "testing",
        };
      }

      return {
        ...RESET_PLAN_STATE,
        flowInstruction: instruction,
        flowInstructionHistory,
        planningError: null,
        planOrigin: "generated",
        screen: "planning",
      };
    }),

  toggleAutoRun: () => set((state) => ({ autoRunAfterPlanning: !state.autoRunAfterPlanning })),
  toggleSkipPlanning: () => set((state) => ({ skipPlanning: !state.skipPlanning })),
  toggleAutoSave: () => set((state) => ({ autoSaveFlows: !state.autoSaveFlows })),

  completePlanning: (result) =>
    set((state) => ({
      resolvedTarget: result.target,
      generatedPlan: result.plan,
      browserEnvironment: result.environment,
      screen:
        state.autoRunAfterPlanning && !result.plan.cookieSync.required ? "testing" : "review-plan",
    })),

  failPlanning: (error) => set({ planningError: error }),

  updatePlan: (plan) => set({ generatedPlan: plan }),

  updateEnvironment: (environment) => set({ browserEnvironment: environment }),

  requestPlanApproval: () =>
    set((state) => ({
      screen:
        state.generatedPlan?.cookieSync.required && state.browserEnvironment?.cookies !== true
          ? "cookie-sync-confirm"
          : "testing",
    })),

  approvePlan: () => set({ screen: "testing" }),

  completeTestingRun: (report) =>
    set({
      latestRunReport: report,
      screen: "results",
    }),

  exitTesting: () =>
    set({
      ...RESET_FLOW_STATE,
      screen: "main",
    }),

  switchBranch: (branch, prNumber) => {
    const success = checkoutBranch(process.cwd(), branch);
    if (success) {
      set({
        ...RESET_PLAN_STATE,
        gitState: getGitState(),
        testAction: "test-branch",
        checkedOutBranch: branch,
        checkedOutPrNumber: prNumber ?? null,
        checkoutError: null,
        selectedCommit: null,
        planOrigin: null,
        screen: "main",
      });
    } else {
      set({
        checkoutError: `Could not checkout "${branch}". You may have uncommitted changes or the branch may not exist locally.`,
      });
    }
  },

  clearCheckoutError: () => set({ checkoutError: null }),
}));
