import { Layer, Logger, References } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { DevTools } from "effect/unstable/devtools";
import { Executor, Git, Planner, Reporter, Updates } from "@browser-tester/supervisor";

const stderrLogger = Logger.make(({ logLevel, message, date }) => {
  console.error(`[effect ${logLevel}] ${date.toISOString()} ${message}`);
});

export const cliAtomRuntime = Atom.runtime(
  Layer.mergeAll(
    Planner.layer,
    Executor.layer,
    Reporter.layer,
    Updates.layer,
    DevTools.layer(),
    Git.withRepoRoot(process.cwd()),
  ).pipe(
    Layer.provideMerge(Logger.layer([stderrLogger])),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "All")),
  ),
);
