import { create } from "zustand";
import type {
  BrowserEnvironmentHints,
  BrowserFlowPlan,
  TestTarget,
} from "@browser-tester/orchestrator";
import type { Commit } from "./utils/fetch-commits.js";
import type { TestAction } from "./utils/browser-agent.js";
import { getGitState, type GitState } from "./utils/get-git-state.js";
import { switchBranch as gitSwitchBranch } from "./utils/switch-branch.js";

export type Screen =
  | "main"
  | "switch-branch"
  | "select-commit"
  | "flow-input"
  | "planning"
  | "review-plan"
  | "testing"
  | "theme";

interface AppStore {
  screen: Screen;
  gitState: GitState | null;
  testAction: TestAction | null;
  selectedCommit: Commit | null;
  flowInstruction: string;
  autoRunAfterPlanning: boolean;
  generatedPlan: BrowserFlowPlan | null;
  resolvedTarget: TestTarget | null;
  browserEnvironment: BrowserEnvironmentHints | null;
  planningError: string | null;

  loadGitState: () => void;
  goBack: () => void;
  navigateTo: (screen: Screen) => void;
  selectAction: (action: TestAction) => void;
  selectCommit: (commit: Commit) => void;
  submitFlowInstruction: (instruction: string) => void;
  toggleAutoRun: () => void;
  completePlanning: (result: {
    target: TestTarget;
    plan: BrowserFlowPlan;
    environment: BrowserEnvironmentHints;
  }) => void;
  failPlanning: (error: string) => void;
  updatePlan: (plan: BrowserFlowPlan) => void;
  updateEnvironment: (environment: BrowserEnvironmentHints | null) => void;
  approvePlan: (plan: BrowserFlowPlan) => void;
  exitTesting: () => void;
  switchBranch: (branch: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  screen: "main",
  gitState: null,
  testAction: null,
  selectedCommit: null,
  flowInstruction: "",
  autoRunAfterPlanning: false,
  generatedPlan: null,
  resolvedTarget: null,
  browserEnvironment: null,
  planningError: null,

  loadGitState: () => set({ gitState: getGitState() }),

  goBack: () =>
    set((state) => {
      if (state.screen === "review-plan" || state.screen === "planning") {
        return { screen: "flow-input" };
      }
      if (state.screen !== "testing") {
        return { screen: "main" };
      }
      return {};
    }),

  navigateTo: (screen) => set({ screen }),

  selectAction: (action) =>
    set({
      testAction: action,
      selectedCommit: null,
      generatedPlan: null,
      resolvedTarget: null,
      browserEnvironment: null,
      screen: "flow-input",
    }),

  selectCommit: (commit) =>
    set({
      testAction: "select-commit",
      selectedCommit: commit,
      generatedPlan: null,
      resolvedTarget: null,
      browserEnvironment: null,
      screen: "flow-input",
    }),

  submitFlowInstruction: (instruction) =>
    set({
      flowInstruction: instruction,
      planningError: null,
      generatedPlan: null,
      resolvedTarget: null,
      browserEnvironment: null,
      screen: "planning",
    }),

  toggleAutoRun: () => set((state) => ({ autoRunAfterPlanning: !state.autoRunAfterPlanning })),

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

  approvePlan: (plan) => set({ generatedPlan: plan, screen: "testing" }),

  exitTesting: () =>
    set({
      testAction: null,
      selectedCommit: null,
      flowInstruction: "",
      generatedPlan: null,
      resolvedTarget: null,
      browserEnvironment: null,
      planningError: null,
      screen: "main",
    }),

  switchBranch: (branch) => {
    const success = gitSwitchBranch(branch);
    if (success) {
      set({ gitState: getGitState(), screen: "main" });
    } else {
      set({ screen: "main" });
    }
  },
}));
