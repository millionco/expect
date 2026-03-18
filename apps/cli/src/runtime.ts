import { Layer, ManagedRuntime } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { Updates } from "@browser-tester/supervisor";

export const CliRuntime = ManagedRuntime.make(Layer.mergeAll(Updates.layer, DevTools.layer()));
