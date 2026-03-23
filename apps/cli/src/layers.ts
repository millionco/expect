import { Cause, Layer, Logger, ManagedRuntime, References } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { Executor, Git, Planner, Reporter, Updates } from "@browser-tester/supervisor";
import { Agent, AgentBackend } from "@browser-tester/agent";

const stderrLogger = Logger.make(({ logLevel, message, date, cause }) => {
  console.error(
    `[effect ${logLevel}] ${date.toISOString()} ${JSON.stringify(
      message,
      null,
      2,
    )} ${cause ? `\n${Cause.pretty(cause)}` : ""}`,
  );
});

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
    Layer.provide(Logger.layer([stderrLogger])),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, verbose ? "All" : "Error")),
  );
