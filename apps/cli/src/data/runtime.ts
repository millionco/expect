import { Layer, Logger, LogLevel, Ref, References } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { DevTools } from "effect/unstable/devtools";
import { Executor, Git, Planner, Reporter, Updates } from "@browser-tester/supervisor";
import { Agent, type AgentBackend } from "@browser-tester/agent";

let _agentBackend: AgentBackend = "codex";

export const setAgentBackend = (backend: AgentBackend) => {
  _agentBackend = backend;
};

const stderrLogger = Logger.make(({ logLevel, message, date }) => {
  console.error(`[effect ${logLevel}] ${date.toISOString()} ${message}`);
});

const buildCliRuntime = () =>
  Atom.runtime(
    Layer.mergeAll(
      Planner.layer,
      Executor.layer,
      Reporter.layer,
      Updates.layer,
      DevTools.layer(),
      Git.withRepoRoot(process.cwd()),
    ).pipe(
      Layer.provideMerge(Agent.layerFor(_agentBackend)),
      Layer.provideMerge(Logger.layer([stderrLogger])),
      Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "All")),
    ),
  );

let _runtime: ReturnType<typeof buildCliRuntime> | undefined;

export const getCliAtomRuntime = () => {
  if (!_runtime) {
    _runtime = buildCliRuntime();
  }
  return _runtime;
};
