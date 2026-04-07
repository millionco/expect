import { Layer, References } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { FlowStorage, Reporter, Updates, Watch } from "@expect/supervisor";
import type { AgentBackend } from "@expect/agent";

import { Analytics, DebugFileLoggerLayer, Tracing } from "@expect/shared/observability";
import { layerSdk } from "expect-sdk/effect";

export const layerCli = ({ verbose, agent }: { verbose: boolean; agent: AgentBackend }) => {
  const sdkLayer = layerSdk(agent ?? "claude", process.cwd());
  const watchLayer = Watch.layer.pipe(Layer.provide(sdkLayer));

  return Layer.mergeAll(
    sdkLayer,
    Reporter.layer,
    Updates.layer,
    FlowStorage.layer,
    DevTools.layer(),
    Analytics.layerPostHog,
    watchLayer,
  ).pipe(
    Layer.provide(DebugFileLoggerLayer),
    Layer.provide(Tracing.layerAxiom("expect-cli")),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, verbose ? "All" : "Info")),
  );
};
