import { Cause, Layer, Logger, References } from "effect";
import { DevTools } from "effect/unstable/devtools";
import {
  Executor,
  Git,
  LiveViewer,
  Planner,
  Reporter,
  Updates,
} from "@expect/supervisor";
import { Agent, AgentBackend } from "@expect/agent";
import {
  layerLiveViewerRpcServer,
  layerLiveViewerStaticServer,
} from "./live-viewer-server.js";

const stderrLogger = Logger.make(({ logLevel, message, date, cause }) => {
  console.error(
    `[effect ${logLevel}] ${date.toISOString()} ${JSON.stringify(
      message,
      null,
      2
    )} ${cause ? `\n${Cause.pretty(cause)}` : ""}`
  );
});

export const layerCli = ({
  verbose,
  agent,
}: {
  verbose: boolean;
  agent: AgentBackend;
}) =>
  Layer.mergeAll(
    Planner.layer,
    Executor.layer,
    Reporter.layer,
    Updates.layer,
    DevTools.layer(),
    Git.withRepoRoot(process.cwd()),
    layerLiveViewerRpcServer,
    layerLiveViewerStaticServer
  ).pipe(
    Layer.provide(Agent.layerFor(agent ?? "claude")),
    Layer.provide(Logger.layer([stderrLogger])),
    Layer.provideMerge(
      Layer.succeed(References.MinimumLogLevel, verbose ? "All" : "Error")
    )
  );
