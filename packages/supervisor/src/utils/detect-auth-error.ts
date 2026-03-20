import type { AgentProvider } from "../types";

const includesAny = (value: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => value.includes(pattern));

const getProviderDisplayName = (provider: AgentProvider): string => {
  if (provider === "claude") return "Claude Code";
  if (provider === "codex") return "Codex";
  return "Cursor";
};

const stripMcpServerErrors = (value: string): string =>
  value
    .split("\n")
    .filter((line) => !line.startsWith("MCP server "))
    .join("\n");

export const detectAuthError = (provider: AgentProvider, cause: unknown): string | undefined => {
  const normalizedCause = stripMcpServerErrors(String(cause)).toLowerCase();

  if (provider === "codex") {
    if (
      includesAny(normalizedCause, [
        "refresh token",
        "access token",
        "sign in again",
        "log out and sign in again",
        "openai_api_key",
        "unauthorized",
        "authentication",
        "api key",
      ])
    ) {
      return [
        "Codex authentication failed.",
        "Run `codex login` to sign in again, or set `OPENAI_API_KEY`.",
      ].join(" ");
    }
  }

  if (provider === "claude") {
    if (
      includesAny(normalizedCause, [
        "claude login",
        "not authenticated",
        "not signed in",
        "login required",
        "please log in",
        "please login",
        "unauthorized",
        "authentication",
        "api key",
      ])
    ) {
      return "Claude Code authentication failed. Run `claude login` to sign in again.";
    }
  }

  if (provider === "cursor") {
    if (
      includesAny(normalizedCause, [
        "not authenticated",
        "not signed in",
        "login required",
        "unauthorized",
        "authentication",
        "api key",
      ])
    ) {
      return "Cursor authentication failed. Sign in to Cursor again, or choose a different agent.";
    }
  }

  if (includesAny(normalizedCause, ["not enabled", "no access"])) {
    return [
      `${getProviderDisplayName(provider)} is not enabled for this account.`,
      "Choose a different agent or enable access first.",
    ].join(" ");
  }

  return undefined;
};
