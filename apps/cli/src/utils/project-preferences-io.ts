import * as fs from "node:fs";
import * as path from "node:path";

export type BrowserMode = "headed" | "headless";

const VALID_BROWSER_MODES: readonly BrowserMode[] = ["headed", "headless"];

export const isValidBrowserMode = (value: unknown): value is BrowserMode =>
  typeof value === "string" && VALID_BROWSER_MODES.includes(value as BrowserMode);

const STATE_DIR = ".expect";
const PREFERENCES_FILE = "project-preferences.json";

const getPreferencesPath = (projectRoot: string): string =>
  path.join(projectRoot, STATE_DIR, PREFERENCES_FILE);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRawState = (projectRoot: string): Record<string, unknown> => {
  try {
    const content = fs.readFileSync(getPreferencesPath(projectRoot), "utf-8");
    const parsed: unknown = JSON.parse(content);
    if (!isPlainObject(parsed)) return {};
    const state: unknown = parsed["state"];
    if (!isPlainObject(state)) return {};
    return state;
  } catch {
    return {};
  }
};

export const readProjectPreference = (projectRoot: string, key: string): unknown =>
  readRawState(projectRoot)[key];

export const writeProjectPreference = (projectRoot: string, key: string, value: unknown): void => {
  try {
    const filePath = getPreferencesPath(projectRoot);
    const state = readRawState(projectRoot);
    state[key] = value;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ state, version: 0 }), "utf-8");
  } catch {
    // HACK: best-effort persistence — read-only FS or permission issues should not crash the CLI
  }
};
