import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TESTIE_STATE_DIR } from "./constants";

const getStoragePath = (name: string): string =>
  path.join(os.homedir(), TESTIE_STATE_DIR, `${name}.json`);

const cache = new Map<string, string>();

export const promptHistoryStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const content = await fsPromises.readFile(getStoragePath(name), "utf-8");
      cache.set(name, content);
      return content;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (cache.get(name) === value) return;
    cache.set(name, value);
    const filePath = getStoragePath(name);
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, value, "utf-8");
  },
  removeItem: async (name: string): Promise<void> => {
    cache.delete(name);
    try {
      await fsPromises.unlink(getStoragePath(name));
    } catch {
      // HACK: file may not exist, safe to ignore
    }
  },
};
