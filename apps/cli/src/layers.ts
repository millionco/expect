import { Layer, References } from "effect";
import { DevTools } from "effect/unstable/devtools";
import {
  Executor,
  FlowStorage,
  Git,
  LiveViewer,
  Reporter,
  Updates,
  Watch,
} from "@expect/supervisor";

import { Agent, AgentBackend } from "@expect/agent";
import { RrVideo } from "@expect/browser";
import { Analytics, DebugFileLoggerLayer, Tracing } from "@expect/shared/observability";
import { CurrentPlanId, PlanId } from "@expect/shared/models";
import { layerLiveViewerRpcServer, layerLiveViewerStaticServer } from "./live-viewer-server";

export const layerCli = ({ verbose, agent }: { verbose: boolean; agent: AgentBackend }) => {
  const gitLayer = Git.withRepoRoot(process.cwd());
  const currentPlanId = Layer.succeed(CurrentPlanId, PlanId.makeUnsafe(crypto.randomUUID()));
  const liveViewerLayer = LiveViewer.layer.pipe(Layer.provide(gitLayer));

  const executorLayer = Executor.layer.pipe(Layer.provide(gitLayer));
  const watchLayer = Watch.layer.pipe(Layer.provide(executorLayer), Layer.provide(gitLayer));

  return Layer.mergeAll(
    Executor.layer.pipe(Layer.provide(gitLayer), Layer.provide(liveViewerLayer)),
    Reporter.layer,
    Updates.layer,
    FlowStorage.layer,
    DevTools.layer(),
    gitLayer,
    Analytics.layerPostHog,
    RrVideo.layer,
    watchLayer,
    layerLiveViewerRpcServer.pipe(Layer.provide(liveViewerLayer)),
    layerLiveViewerStaticServer,
  ).pipe(
    Layer.provide(currentPlanId),
    Layer.provide(Agent.layerFor(agent ?? "claude")),
    Layer.provide(DebugFileLoggerLayer),
    Layer.provide(Tracing.layerAxiom),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, verbose ? "All" : "Error")),
  );
};
