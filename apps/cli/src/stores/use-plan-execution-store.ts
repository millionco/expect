import { create } from "zustand";
import { ExecutedTestPlan } from "@browser-tester/supervisor";

interface PlanExecutionStore {
  executedPlan: ExecutedTestPlan | undefined;
  setExecutedPlan: (plan: ExecutedTestPlan | undefined) => void;
}

export const usePlanExecutionStore = create<PlanExecutionStore>((set) => ({
  executedPlan: undefined,
  setExecutedPlan: (executedPlan) => set({ executedPlan }),
}));
