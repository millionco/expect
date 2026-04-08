import * as fs from "node:fs";
import * as path from "node:path";
import * as TOML from "@iarna/toml";
import { ConfigRecord } from "./config-types";
import { deepMerge } from "./config-utils";

export const readTomlConfig = (configPath: string): ConfigRecord => {
  if (!fs.existsSync(configPath)) return {};
  const content = fs.readFileSync(configPath, "utf8");
  return TOML.parse(content) as ConfigRecord;
};

export const writeTomlConfig = (configPath: string, partialConfig: ConfigRecord): void => {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existingConfig = fs.existsSync(configPath) ? readTomlConfig(configPath) : {};
  const mergedConfig = deepMerge(existingConfig, partialConfig);
  fs.writeFileSync(configPath, TOML.stringify(mergedConfig as TOML.JsonMap));
};
