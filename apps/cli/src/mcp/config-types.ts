export type ConfigFormat = "json" | "toml";

export interface ConfigRecord {
  [key: string]: unknown;
}

export interface McpServerConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
}
