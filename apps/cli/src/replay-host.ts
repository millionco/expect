import { ServiceMap } from "effect";
import { DEFAULT_REPLAY_HOST } from "@expect/shared";

export const ReplayHost = ServiceMap.Reference<string>("expect-cli/ReplayHost", {
  defaultValue: () => DEFAULT_REPLAY_HOST,
});
