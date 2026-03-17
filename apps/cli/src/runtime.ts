import { Layer, ManagedRuntime } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { FlowStorage } from "@browser-tester/supervisor";

export const CliRuntime = ManagedRuntime.make(Layer.merge(FlowStorage.layer, DevTools.layer()));
