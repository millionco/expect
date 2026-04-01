import { Effect, Layer, Option } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { AgentBackend } from "@expect/agent";
import { layerCli } from "../layers";
import { usePreferencesStore } from "../stores/use-preferences";

export const agentProviderAtom = Atom.make<Option.Option<AgentBackend>>(Option.none());

export const cliAtomRuntime = Atom.runtime(
  Effect.fnUntraced(function* (get) {
    const agentProvider = yield* get.some(agentProviderAtom);
    // HACK: reads Zustand imperatively — only correct at startup, won't re-derive if verbose changes later
    return layerCli({ verbose: usePreferencesStore.getState().verbose, agent: agentProvider });
  }, Layer.unwrap),
).pipe(Atom.keepAlive);
