import * as fs from "node:fs";
import path from "node:path";
import {
  MEMORY_INDEX_FILE_NAME,
  MEMORY_INDEX_VERSION,
  MEMORY_MAX_STORED_RUNS,
  MEMORY_ROOT_DIRECTORY_NAME,
  MEMORY_RUNS_DIRECTORY_NAME,
  MEMORY_SUBDIRECTORY_NAME,
  MEMORY_SUMMARY_FILE_NAME,
} from "../constants";
import type { MemoryIndex, RunMemoryRecord } from "./types";

export const resolveMemoryDirectoryPath = (cwd: string): string =>
  path.join(cwd, MEMORY_ROOT_DIRECTORY_NAME, MEMORY_SUBDIRECTORY_NAME);

const resolveRunsDirectoryPath = (cwd: string): string =>
  path.join(resolveMemoryDirectoryPath(cwd), MEMORY_RUNS_DIRECTORY_NAME);

const ensureDirectoryExists = (directoryPath: string): void => {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
};

const createEmptyMemoryIndex = (): MemoryIndex => ({
  version: MEMORY_INDEX_VERSION,
  lastUpdatedAt: new Date().toISOString(),
  totalRuns: 0,
  routes: [],
  flows: [],
  failures: [],
  environmentFacts: [],
});

export const readMemoryIndex = (cwd: string): MemoryIndex => {
  const indexPath = path.join(resolveMemoryDirectoryPath(cwd), MEMORY_INDEX_FILE_NAME);
  try {
    return JSON.parse(fs.readFileSync(indexPath, "utf-8")) as MemoryIndex;
  } catch {
    return createEmptyMemoryIndex();
  }
};

export const writeMemoryIndex = (cwd: string, index: MemoryIndex): void => {
  const memoryDirectoryPath = resolveMemoryDirectoryPath(cwd);
  ensureDirectoryExists(memoryDirectoryPath);
  fs.writeFileSync(
    path.join(memoryDirectoryPath, MEMORY_INDEX_FILE_NAME),
    JSON.stringify(index, null, 2),
    "utf-8",
  );
};

export const writeMemorySummary = (cwd: string, content: string): void => {
  const memoryDirectoryPath = resolveMemoryDirectoryPath(cwd);
  ensureDirectoryExists(memoryDirectoryPath);
  fs.writeFileSync(path.join(memoryDirectoryPath, MEMORY_SUMMARY_FILE_NAME), content, "utf-8");
};

export const readRunMemories = (cwd: string): RunMemoryRecord[] => {
  const runsDirectoryPath = resolveRunsDirectoryPath(cwd);
  try {
    const fileNames = fs
      .readdirSync(runsDirectoryPath)
      .filter((fileName) => fileName.endsWith(".json"))
      .sort()
      .reverse();

    return fileNames
      .slice(0, MEMORY_MAX_STORED_RUNS)
      .map((fileName) => {
        try {
          return JSON.parse(
            fs.readFileSync(path.join(runsDirectoryPath, fileName), "utf-8"),
          ) as RunMemoryRecord;
        } catch {
          return null;
        }
      })
      .filter((record): record is RunMemoryRecord => record !== null);
  } catch {
    return [];
  }
};

const pruneOldRunMemories = (cwd: string): void => {
  const runsDirectoryPath = resolveRunsDirectoryPath(cwd);
  try {
    const fileNames = fs
      .readdirSync(runsDirectoryPath)
      .filter((fileName) => fileName.endsWith(".json"))
      .sort()
      .reverse();

    for (const fileName of fileNames.slice(MEMORY_MAX_STORED_RUNS)) {
      try {
        fs.unlinkSync(path.join(runsDirectoryPath, fileName));
      } catch {}
    }
  } catch {}
};

export const writeRunMemory = (cwd: string, record: RunMemoryRecord): void => {
  const runsDirectoryPath = resolveRunsDirectoryPath(cwd);
  ensureDirectoryExists(runsDirectoryPath);
  fs.writeFileSync(
    path.join(runsDirectoryPath, `${record.id}.json`),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
  pruneOldRunMemories(cwd);
};
