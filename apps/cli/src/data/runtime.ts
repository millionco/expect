import { Effect, Layer, Option } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { Agent, AgentBackend } from "@browser-tester/agent";
import { layerCli } from "../layers.js";

export const agentProviderAtom = Atom.make<Option.Option<AgentBackend>>(Option.none());

export const cliAtomRuntime = Atom.runtime(
  Effect.fnUntraced(function* (get) {
    const agentProvider = yield* get.some(agentProviderAtom);
    return layerCli({ verbose: true, agent: agentProvider });
  }, Layer.unwrap),
).pipe(Atom.keepAlive);
