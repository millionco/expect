import { detectTerminal } from "detect-terminal";

const NO_SGR_MOUSE_TERMINALS = new Set([
  "linux_console",
  "vt100",
  "putty",
  "eterm",
  "rxvt",
]);

const XTERM_JS_TERMINALS = new Set(["vscode", "hyper"]);

export const detectMouseSupport = (): boolean => {
  if (!process.stdin.isTTY) return false;
  if (process.env.SSH_TTY || process.env.SSH_CLIENT || process.env.SSH_CONNECTION) return false;

  const terminal = detectTerminal({ preferOuter: true });
  if (!terminal || terminal === "unknown") return false;
  return !NO_SGR_MOUSE_TERMINALS.has(terminal);
};

export const getSelectionBypassHint = (): string => {
  const terminal = detectTerminal({ preferOuter: true });
  if (XTERM_JS_TERMINALS.has(terminal ?? "") && process.platform === "darwin") return "opt";
  return "shift";
};