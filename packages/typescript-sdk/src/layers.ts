import { Layer } from "effect";
import { Executor, Git } from "@expect/supervisor";
import { Agent, type AgentBackend } from "@expect/agent";

export const layerSdk = (agentBackend: AgentBackend, rootDir: string) => {
  const gitLayer = Git.withRepoRoot(rootDir);
  const agentLayer = Agent.layerFor(agentBackend);
  const executorLayer = Executor.layer.pipe(Layer.provide(gitLayer));

  return Layer.mergeAll(executorLayer, gitLayer).pipe(Layer.provideMerge(agentLayer));
};
