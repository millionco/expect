import { createRunMemory } from "./create-run-memory.js";
import { writeRunMemory } from "./memory-store.js";
import { promoteMemories } from "./promote-memories.js";
import type { CreateRunMemoryOptions, RunMemoryRecord } from "./types.js";

export const recordRun = (options: CreateRunMemoryOptions): RunMemoryRecord => {
  const record = createRunMemory(options);
  try {
    writeRunMemory(options.target.cwd, record);
  } catch {}
  try {
    promoteMemories(options.target.cwd);
  } catch {}
  return record;
};
