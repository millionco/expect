import { arch, availableParallelism, cpus, freemem, loadavg, platform, totalmem } from "node:os";

import {
  BROWSER_MEMORY_OVERHEAD_MB,
  BYTES_PER_MB,
  FALLBACK_CPU_CORES,
  MEMORY_SAFETY_RATIO,
} from "./constants";

export interface SystemStats {
  platform: NodeJS.Platform;
  arch: string;
  cpuCores: number;
  cpuModel: string;
  cpuLoadPercent: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  memoryUsagePercent: number;
}

export interface BrowserCapacity {
  system: SystemStats;
  maxBrowsers: number;
  bottleneck: "memory" | "cpu";
}

const resolveCpuCoreCount = (): number => {
  try {
    return availableParallelism();
  } catch {}
  try {
    const entries = cpus();
    if (entries.length > 0) return entries.length;
  } catch {}
  const navigatorCores = globalThis.navigator?.hardwareConcurrency;
  if (typeof navigatorCores === "number" && navigatorCores > 0) return navigatorCores;
  return FALLBACK_CPU_CORES;
};

const resolveCpuModel = (): string => {
  try {
    return cpus()[0]?.model ?? "unknown";
  } catch {
    return "unknown";
  }
};

export const getSystemStats = (): SystemStats => {
  const coreCount = resolveCpuCoreCount();
  const totalMemoryMb = Math.floor(totalmem() / BYTES_PER_MB);
  const freeMemoryMb = Math.min(Math.floor(freemem() / BYTES_PER_MB), totalMemoryMb);
  const oneMinuteLoad = loadavg()[0];
  const cpuLoadPercent = Math.min(100, Math.round((oneMinuteLoad / coreCount) * 100));

  return {
    platform: platform(),
    arch: arch(),
    cpuCores: coreCount,
    cpuModel: resolveCpuModel(),
    cpuLoadPercent,
    totalMemoryMb,
    freeMemoryMb,
    memoryUsagePercent:
      totalMemoryMb > 0 ? Math.round(((totalMemoryMb - freeMemoryMb) / totalMemoryMb) * 100) : 0,
  };
};

export const estimateBrowserCapacity = (): BrowserCapacity => {
  const system = getSystemStats();

  const availableMemoryMb = system.freeMemoryMb * MEMORY_SAFETY_RATIO;
  const memoryBound = Math.floor(availableMemoryMb / BROWSER_MEMORY_OVERHEAD_MB);

  const idleCoreRatio = 1 - system.cpuLoadPercent / 100;
  const cpuBound = Math.max(1, Math.ceil(system.cpuCores * idleCoreRatio));

  const bottleneck = memoryBound <= cpuBound ? "memory" : "cpu";
  const maxBrowsers = Math.max(1, Math.min(memoryBound, cpuBound));

  return { system, maxBrowsers, bottleneck };
};
