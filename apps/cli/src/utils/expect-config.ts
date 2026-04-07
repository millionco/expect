import * as fs from "node:fs";
import * as path from "node:path";

export type BrowserMode = "cdp" | "headed" | "headless";

interface ExpectConfig {
  browserMode: BrowserMode;
}

const CONFIG_DIR = ".expect";
const CONFIG_FILE = "config.json";

const VALID_BROWSER_MODES: readonly BrowserMode[] = ["cdp", "headed", "headless"];

export const isValidBrowserMode = (value: unknown): value is BrowserMode =>
  typeof value === "string" && VALID_BROWSER_MODES.includes(value as BrowserMode);

export const readExpectConfig = (projectRoot: string): ExpectConfig | undefined => {
  const configPath = path.join(projectRoot, CONFIG_DIR, CONFIG_FILE);
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    if (!isValidBrowserMode(record["browserMode"])) return undefined;
    return { browserMode: record["browserMode"] };
  } catch {
    return undefined;
  }
};

export const writeExpectConfig = (projectRoot: string, config: ExpectConfig) => {
  const dirPath = path.join(projectRoot, CONFIG_DIR);
  fs.mkdirSync(dirPath, { recursive: true });
  const configPath = path.join(dirPath, CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, undefined, 2) + "\n");
};
