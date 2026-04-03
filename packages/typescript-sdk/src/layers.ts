import { Layer, References } from "effect";
import { Executor, Git } from "@expect/supervisor";
import { Agent, type AgentBackend } from "@expect/agent";

export const layerSdk = (agentBackend: AgentBackend, rootDir: string) => {
  const gitLayer = Git.withRepoRoot(rootDir);
  const executorLayer = Executor.layer.pipe(Layer.provide(gitLayer));

  return Layer.mergeAll(executorLayer, gitLayer).pipe(
    Layer.provide(Agent.layerFor(agentBackend)),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "Error")),
  );
};
