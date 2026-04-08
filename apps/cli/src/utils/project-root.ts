import { Effect } from "effect";
import { Git } from "@expect/supervisor";

export const resolveProjectRoot = () => Effect.runPromise(Git.resolveProjectRoot(process.cwd()));
