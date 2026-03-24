import { Layer, References } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { Executor, Git, Planner, Reporter, Updates } from "@expect/supervisor";
import { Agent, AgentBackend } from "@expect/agent";
import { DebugFileLoggerLayer } from "@expect/shared/observability";

export const layerCli = ({ verbose, agent }: { verbose: boolean; agent: AgentBackend }) =>
  Layer.mergeAll(
    Planner.layer,
    Executor.layer,
    Reporter.layer,
    Updates.layer,
    DevTools.layer(),
    Git.withRepoRoot(process.cwd()),
  ).pipe(
    Layer.provide(Agent.layerFor(agent ?? "claude")),
    Layer.provide(DebugFileLoggerLayer),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, verbose ? "All" : "Error")),
  );
