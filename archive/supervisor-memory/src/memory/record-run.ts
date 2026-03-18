import { createRunMemory } from "./create-run-memory";
import { writeRunMemory } from "./memory-store";
import { promoteMemories } from "./promote-memories";
import type { CreateRunMemoryOptions, RunMemoryRecord } from "./types";

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
