import { Layer } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { layerCli } from "../layers";
import type { AgentBackend } from "@expect/agent";

interface ViewerOptions {
  verbose?: boolean;
  agent?: AgentBackend;
  replayHost?: string;
}

export const runViewer = (options: ViewerOptions = {}) => {
  console.log("[viewer] options:", options);
  const layer = layerCli({
    verbose: options.verbose ?? false,
    agent: options.agent ?? "claude",
    replayHost: options.replayHost,
  });

  Layer.launch(layer).pipe(NodeRuntime.runMain);
};
