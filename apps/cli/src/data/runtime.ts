import { Layer } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { DevTools } from "effect/unstable/devtools";
import { Executor, Git, Planner, Reporter, Updates } from "@browser-tester/supervisor";
import { Agent } from "@browser-tester/agent";

const agentLayer = Agent.layerFor("codex");

export const cliAtomRuntime = Atom.runtime(
  Layer.mergeAll(Updates.layer, DevTools.layer(), Git.withRepoRoot(process.cwd())).pipe(
    Layer.provideMerge(Planner.layer),
    Layer.provideMerge(Executor.layer),
    Layer.provideMerge(Reporter.layer),
    Layer.provideMerge(agentLayer),
  ),
);
