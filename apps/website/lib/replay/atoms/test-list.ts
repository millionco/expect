import { Effect } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ViewerClient, ViewerRuntime } from "../rpc-client";

export const testListAtom = ViewerRuntime.atom(
  Effect.gen(function* () {
    const client = yield* ViewerClient;
    return yield* client("liveViewer.ListTests", undefined);
  }),
).pipe(Atom.keepAlive);
