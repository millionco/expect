interface DevToolsActivePort {
  readonly port: number;
  readonly wsPath: string;
}

export const parseDevToolsActivePort = (content: string): DevToolsActivePort | undefined => {
  const lines = content.trim().split("\n");
  const portStr = lines[0]?.trim();
  if (!portStr) return undefined;
  const port = Number.parseInt(portStr, 10);
  if (Number.isNaN(port)) return undefined;
  const wsPath = lines[1]?.trim() ?? "/devtools/browser";
  return { port, wsPath };
};
