import { Effect } from "effect";
import { Git } from "@expect/supervisor";

export const resolveProjectRoot = (): string => findGitRoot();

const findGitRoot = (): string => {
  const cwd = process.cwd();
  return Effect.runSync(Git.resolveProjectRoot(cwd));
};
