import { Layer, Logger, References } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { Executor, FlowStorage, Git, Reporter, Updates } from "@expect/supervisor";
import { Agent, AgentBackend } from "@expect/agent";
import { Analytics, DebugFileLoggerLayer, Tracing } from "@expect/shared/observability";

export const layerCli = ({ verbose, agent }: { verbose: boolean; agent: AgentBackend }) => {
  const gitLayer = Git.withRepoRoot(process.cwd());
  const loggerLayer = verbose
    ? Layer.mergeAll(DebugFileLoggerLayer, Logger.layer([Logger.consoleLogFmt]))
    : DebugFileLoggerLayer;

  return Layer.mergeAll(
    Executor.layer.pipe(Layer.provide(gitLayer)),
    Reporter.layer,
    Updates.layer,
    FlowStorage.layer,
    DevTools.layer(),
    gitLayer,
    Analytics.layerPostHog,
  ).pipe(
    Layer.provide(Agent.layerFor(agent ?? "claude")),
    Layer.provide(loggerLayer),
    Layer.provide(Tracing.layerAxiom),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, verbose ? "All" : "Error")),
  );
};
