import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TESTIE_STATE_DIR } from "../src/constants";
import { promptHistoryStorage } from "../src/prompt-history";

vi.mock("node:fs/promises");

const storagePath = (name: string) => path.join(os.homedir(), TESTIE_STATE_DIR, `${name}.json`);

describe("promptHistoryStorage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    promptHistoryStorage.removeItem("test");
  });

  describe("getItem", () => {
    it("returns file contents when file exists", async () => {
      const stored = JSON.stringify({ state: { instructionHistory: ["hello"] } });
      vi.mocked(fsPromises.readFile).mockResolvedValue(stored);

      const result = await promptHistoryStorage.getItem("test");

      expect(result).toBe(stored);
      expect(fsPromises.readFile).toHaveBeenCalledWith(storagePath("test"), "utf-8");
    });

    it("returns null when file does not exist", async () => {
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error("ENOENT"));

      const result = await promptHistoryStorage.getItem("test");

      expect(result).toBeNull();
    });
  });

  describe("setItem", () => {
    it("writes value to disk", async () => {
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.writeFile).mockResolvedValue();

      const value = JSON.stringify({ state: { instructionHistory: ["first"] } });
      await promptHistoryStorage.setItem("write-test", value);

      expect(fsPromises.mkdir).toHaveBeenCalledWith(path.dirname(storagePath("write-test")), {
        recursive: true,
      });
      expect(fsPromises.writeFile).toHaveBeenCalledWith(storagePath("write-test"), value, "utf-8");

      await promptHistoryStorage.removeItem("write-test");
    });

    it("skips write when value matches cache", async () => {
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.writeFile).mockResolvedValue();

      const value = JSON.stringify({ state: { instructionHistory: ["cached"] } });
      await promptHistoryStorage.setItem("cache-test", value);

      vi.mocked(fsPromises.writeFile).mockClear();
      vi.mocked(fsPromises.mkdir).mockClear();

      await promptHistoryStorage.setItem("cache-test", value);

      expect(fsPromises.writeFile).not.toHaveBeenCalled();
      expect(fsPromises.mkdir).not.toHaveBeenCalled();

      await promptHistoryStorage.removeItem("cache-test");
    });

    it("writes when value differs from cache", async () => {
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.writeFile).mockResolvedValue();

      const first = JSON.stringify({ state: { instructionHistory: ["a"] } });
      const second = JSON.stringify({ state: { instructionHistory: ["a", "b"] } });

      await promptHistoryStorage.setItem("diff-test", first);
      vi.mocked(fsPromises.writeFile).mockClear();

      await promptHistoryStorage.setItem("diff-test", second);

      expect(fsPromises.writeFile).toHaveBeenCalledWith(storagePath("diff-test"), second, "utf-8");

      await promptHistoryStorage.removeItem("diff-test");
    });
  });

  describe("removeItem", () => {
    it("deletes the file", async () => {
      vi.mocked(fsPromises.unlink).mockResolvedValue();

      await promptHistoryStorage.removeItem("del-test");

      expect(fsPromises.unlink).toHaveBeenCalledWith(storagePath("del-test"));
    });

    it("does not throw when file does not exist", async () => {
      vi.mocked(fsPromises.unlink).mockRejectedValue(new Error("ENOENT"));

      await expect(promptHistoryStorage.removeItem("missing")).resolves.toBeUndefined();
    });

    it("invalidates cache so next setItem writes", async () => {
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.writeFile).mockResolvedValue();
      vi.mocked(fsPromises.unlink).mockResolvedValue();

      const value = JSON.stringify({ state: { instructionHistory: ["x"] } });
      await promptHistoryStorage.setItem("inval-test", value);

      await promptHistoryStorage.removeItem("inval-test");

      vi.mocked(fsPromises.writeFile).mockClear();
      await promptHistoryStorage.setItem("inval-test", value);

      expect(fsPromises.writeFile).toHaveBeenCalled();

      await promptHistoryStorage.removeItem("inval-test");
    });
  });

  describe("getItem populates cache", () => {
    it("skips write after getItem returns same value", async () => {
      const value = JSON.stringify({ state: { instructionHistory: ["read"] } });
      vi.mocked(fsPromises.readFile).mockResolvedValue(value);
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.writeFile).mockResolvedValue();

      await promptHistoryStorage.getItem("read-test");
      vi.mocked(fsPromises.writeFile).mockClear();

      await promptHistoryStorage.setItem("read-test", value);

      expect(fsPromises.writeFile).not.toHaveBeenCalled();

      await promptHistoryStorage.removeItem("read-test");
    });
  });
});
