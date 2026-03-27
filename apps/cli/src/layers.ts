import { Layer, References } from "effect";
import { DevTools } from "effect/unstable/devtools";
import {
  Executor,
  FlowStorage,
  Git,
  Reporter,
  TestCoverage,
  Updates,
  Watch,
} from "@expect/supervisor";
import { Agent, AgentBackend } from "@expect/agent";
import { Analytics, DebugFileLoggerLayer, Tracing } from "@expect/shared/observability";

export const layerCli = ({ verbose, agent }: { verbose: boolean; agent: AgentBackend }) => {
  const gitLayer = Git.withRepoRoot(process.cwd());
  const testCoverageLayer = TestCoverage.layer.pipe(Layer.provide(gitLayer));

  return Layer.mergeAll(
    Executor.layer.pipe(Layer.provide(gitLayer)),
    Reporter.layer,
    Updates.layer,
    Watch.layer.pipe(Layer.provide(gitLayer), Layer.provide(testCoverageLayer)),
    FlowStorage.layer,
    DevTools.layer(),
    gitLayer,
    Analytics.layerPostHog,
  ).pipe(
    Layer.provide(Agent.layerFor(agent ?? "claude")),
    Layer.provide(DebugFileLoggerLayer),
    Layer.provide(Tracing.layerAxiom),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, verbose ? "All" : "Error")),
  );
};
