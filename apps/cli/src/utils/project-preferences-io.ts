import * as fs from "node:fs";
import * as path from "node:path";

export type BrowserMode = "cdp" | "headed" | "headless";

const VALID_BROWSER_MODES: readonly BrowserMode[] = ["cdp", "headed", "headless"];

export const isValidBrowserMode = (value: unknown): value is BrowserMode =>
  typeof value === "string" && VALID_BROWSER_MODES.includes(value as BrowserMode);

const STATE_DIR = ".expect";
const PREFERENCES_FILE = "project-preferences.json";

const getPreferencesPath = (projectRoot: string): string =>
  path.join(projectRoot, STATE_DIR, PREFERENCES_FILE);

const readRawState = (projectRoot: string): Record<string, unknown> => {
  try {
    const content = fs.readFileSync(getPreferencesPath(projectRoot), "utf-8");
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === undefined || Array.isArray(parsed)) return {};
    const envelope = parsed as Record<string, unknown>;
    const state = envelope["state"];
    if (typeof state !== "object" || state === undefined || Array.isArray(state)) return {};
    return state as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const readProjectPreference = <T>(projectRoot: string, key: string): T | undefined => {
  const state = readRawState(projectRoot);
  return state[key] as T | undefined;
};

export const writeProjectPreference = (projectRoot: string, key: string, value: unknown): void => {
  const filePath = getPreferencesPath(projectRoot);
  const state = readRawState(projectRoot);
  state[key] = value;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ state, version: 0 }), "utf-8");
};
