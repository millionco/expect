import * as Atom from "effect/unstable/reactivity/Atom";
import { PlanId } from "@expect/shared/models";

export const selectedTestIdAtom = Atom.searchParam("testId", {
  schema: PlanId,
});
