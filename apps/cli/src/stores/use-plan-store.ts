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
  setPlan: (plan: Plan | undefined) => void;
}

export const usePlanStore = create<PlanStore>((set) => ({
  plan: undefined,
  setPlan: (plan) => set({ plan }),
}));
