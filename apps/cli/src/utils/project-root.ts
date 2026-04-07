import { Effect } from "effect";
import { Git } from "@expect/supervisor";

export const resolveProjectRoot = async () => findGitRoot();

const findGitRoot = async () => {
  const cwd = process.cwd();
  return Effect.runPromise(Git.resolveProjectRoot(cwd));
};
