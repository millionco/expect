import { Config, Effect, Option } from "effect";
import type { AgentProvider } from "./models";

const AGENT_ENV_MAP: ReadonlyArray<readonly [envVariable: string, agent: AgentProvider]> = [
  ["CLAUDECODE", "claude"],
  ["CURSOR_AGENT", "cursor"],
  ["CODEX_CI", "codex"],
  ["OPENCODE", "opencode"],
  ["PI_CODING_AGENT_DIR", "pi"],
];

export const inferAgentFromEnv = Effect.gen(function* () {
  for (const [envVariable, agent] of AGENT_ENV_MAP) {
    const value = yield* Config.string(envVariable).pipe(Config.option);
    if (Option.isSome(value)) return Option.some(agent);
  }
  return Option.none<AgentProvider>();
}).pipe(Effect.withSpan("inferAgentFromEnv"));

export const resolveAgentProvider = (override?: AgentProvider): AgentProvider =>
  override ?? Option.getOrElse(Effect.runSync(inferAgentFromEnv), () => "claude" as AgentProvider);
