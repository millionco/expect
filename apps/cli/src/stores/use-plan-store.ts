import { create } from "zustand";
import { TestPlanDraft, type TestPlan } from "@browser-tester/supervisor";
import * as Data from "effect/Data";

export type Plan = Data.TaggedEnum<{
  draft: TestPlanDraft;
  plan: TestPlan;
}>;
export const Plan = Data.taggedEnum<Plan>();

interface PlanStore {
  plan: Plan | undefined;
  readyTestPlan: TestPlan | undefined;
  setPlan: (plan: Plan | undefined) => void;
  setReadyTestPlan: (plan: TestPlan | undefined) => void;
}

export const usePlanStore = create<PlanStore>((set) => ({
  plan: undefined,
  readyTestPlan: undefined,
  setPlan: (plan) => set({ plan }),
  setReadyTestPlan: (readyTestPlan) => set({ readyTestPlan }),
}));
