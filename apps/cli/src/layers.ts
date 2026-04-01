import { Layer, References } from "effect";
import { DevTools } from "effect/unstable/devtools";
import {
  Executor,
  FlowStorage,
  Git,
  LiveViewer,
  OutputReporter,
  Reporter,
  Updates,
  Watch,
} from "@expect/supervisor";

import { Agent, AgentBackend } from "@expect/agent";
import { RrVideo } from "@expect/browser";
import {
  Analytics,
  DebugFileLoggerLayer,
  Tracing,
} from "@expect/shared/observability";
import { CurrentPlanId, PlanId } from "@expect/shared/models";
import {
  layerLiveViewerRpcServer,
  layerLiveViewerStaticServer,
} from "./live-viewer-server";
import { OutputReporterHooks } from "../../../packages/supervisor/src/output-reporter";

interface LayerCliOptions {
  verbose: boolean;
  agent: AgentBackend;
  reporter?: "json" | "github-actions";
  timeoutMs?: number;
}

export const layerCli = ({
  verbose,
  agent,
  reporter,
  timeoutMs,
}: LayerCliOptions) => {
  const currentPlanId = Layer.succeed(
    CurrentPlanId,
    PlanId.makeUnsafe(crypto.randomUUID())
  );

  const outputReporterLayer =
    reporter === "json"
      ? OutputReporter.layerJson
      : reporter === "github-actions"
      ? OutputReporter.layerGitHubActions({ agent, timeoutMs })
      : OutputReporter.layerStdoutNoop({ agent, timeoutMs });

  return Layer.mergeAll(
    Executor.layer,
    Reporter.layer,
    Updates.layer,
    FlowStorage.layer,
    DevTools.layer(),
    Analytics.layerPostHog,
    RrVideo.layer,
    Watch.layer,
    layerLiveViewerRpcServer,
    layerLiveViewerStaticServer
  ).pipe(
    Layer.provideMerge(outputReporterLayer),
    Layer.provideMerge(currentPlanId),
    Layer.provide(Agent.layerFor(agent ?? "claude")),
    Layer.provide(DebugFileLoggerLayer),
    Layer.provide(Tracing.layerAxiom),
    Layer.provideMerge(Git.withRepoRoot(process.cwd())),
    Layer.provideMerge(
      Layer.succeed(References.MinimumLogLevel, verbose ? "All" : "Error")
    )
  );
};
