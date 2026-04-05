import { Function as F, Layer, References } from "effect";
import { NodeServices } from "@effect/platform-node";
import { DevTools } from "effect/unstable/devtools";
import {
  Executor,
  FlowStorage,
  Git,
  ArtifactStore,
  OutputReporter,
  Reporter,
  Updates,
  Watch,
} from "@expect/supervisor";

import { Agent, AgentBackend } from "@expect/agent";
import { RrVideo } from "@expect/browser";
import { layerLive as cookiesLayerLive } from "@expect/cookies";
import { Analytics, DebugFileLoggerLayer, Tracing } from "@expect/shared/observability";
import { CurrentPlanId, PlanId } from "@expect/shared/models";
import { layerArtifactRpcServer, layerArtifactViewerProxy } from "./artifact-server";
import { ReplayHost } from "./replay-host";

interface LayerCliOptions {
  verbose: boolean;
  agent: AgentBackend;
  reporter?: "json" | "github-actions";
  timeoutMs?: number;
  replayHost?: string;
  testId?: string;
}

export const layerCli = ({
  verbose,
  agent,
  reporter,
  timeoutMs,
  replayHost,
  testId,
}: LayerCliOptions) => {
  const currentPlanId = Layer.succeed(
    CurrentPlanId,
    PlanId.makeUnsafe(testId ?? crypto.randomUUID()),
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
    Analytics.layerDev,
    RrVideo.layer,
    Watch.layer,
    layerArtifactRpcServer,
    layerArtifactViewerProxy,
  ).pipe(
    Layer.provideMerge(outputReporterLayer),
    Layer.provideMerge(Agent.layerFor(agent ?? "claude")),
    Layer.provideMerge(currentPlanId),
    replayHost ? Layer.provideMerge(Layer.succeed(ReplayHost, replayHost)) : F.identity,
    Layer.provide(DebugFileLoggerLayer),
    Layer.provide(Tracing.layerAxiom("expect-cli")),
    Layer.provideMerge(cookiesLayerLive),
    Layer.provideMerge(Git.withRepoRoot(process.cwd())),
    /** @note(rasmus): w json reporter we cant have any logs out */
    Layer.provideMerge(
      Layer.succeed(References.MinimumLogLevel, verbose && reporter !== "json" ? "All" : "Error"),
    ),
  );
};
