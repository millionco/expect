import { Cause, Effect, Layer, Logger, Option, References } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { DevTools } from "effect/unstable/devtools";
import {
  Executor,
  Git,
  Planner,
  Reporter,
  Updates,
} from "@browser-tester/supervisor";
import { Agent, AgentBackend } from "@browser-tester/agent";

const stderrLogger = Logger.make(({ logLevel, message, date, cause }) => {
  console.error(
    `[effect ${logLevel}] ${date.toISOString()} ${JSON.stringify(
      message,
      null,
      2
    )} ${cause ? `\n${Cause.pretty(cause)}` : ""}`
  );
});

export const agentProviderAtom = Atom.make<Option.Option<AgentBackend>>(
  Option.none()
);

export const cliAtomRuntime = Atom.runtime(
  Effect.fnUntraced(function* (get) {
    console.error("GETTING AGENT PROVIDER ATOM");
    const x = get(agentProviderAtom);
    console.error("X", x);
    const agentProvider = yield* get.some(agentProviderAtom);
    console.error("AGENT PROVIDER", agentProvider);

    return Layer.mergeAll(
      Planner.layer,
      Executor.layer,
      Reporter.layer,
      Updates.layer,
      DevTools.layer(),
      Git.withRepoRoot(process.cwd())
    ).pipe(
      Layer.provide(Agent.layerFor(agentProvider)),
      Layer.provide(Logger.layer([stderrLogger])),
      Layer.provide(Layer.succeed(References.MinimumLogLevel, "All"))
    );
  }, Layer.unwrap)
).pipe(Atom.keepAlive);

/*
export const cliAtomRuntime = Atom.runtime(
  Layer.mergeAll(
    Planner.layer,
    Executor.layer,
    Reporter.layer,
    Updates.layer,
    DevTools.layer(),
    Git.withRepoRoot(process.cwd())
  ).pipe(
    Layer.provideMerge(Logger.layer([stderrLogger])),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "All"))
  )
);
 */
