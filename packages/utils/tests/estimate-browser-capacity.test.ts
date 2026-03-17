import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BROWSER_MEMORY_OVERHEAD_MB, MEMORY_SAFETY_RATIO } from "../src/constants";

vi.mock("node:os", () => ({
  availableParallelism: vi.fn(),
  cpus: vi.fn(),
  freemem: vi.fn(),
  totalmem: vi.fn(),
  loadavg: vi.fn(),
  platform: vi.fn(),
  arch: vi.fn(),
}));

import { availableParallelism, cpus, freemem, loadavg, platform, totalmem, arch } from "node:os";
import { estimateBrowserCapacity, getSystemStats } from "../src/estimate-browser-capacity";

const BYTES_PER_MB = 1024 * 1024;

const mockSystem = ({
  cores = 8,
  model = "Apple M1",
  totalMb = 16384,
  freeMb = 8192,
  load = 2.0,
  os = "darwin" as NodeJS.Platform,
  architecture = "arm64",
} = {}) => {
  vi.mocked(availableParallelism).mockReturnValue(cores);
  vi.mocked(cpus).mockReturnValue(
    Array.from({ length: cores }, () => ({
      model,
      speed: 2400,
      times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
    })),
  );
  vi.mocked(totalmem).mockReturnValue(totalMb * BYTES_PER_MB);
  vi.mocked(freemem).mockReturnValue(freeMb * BYTES_PER_MB);
  vi.mocked(loadavg).mockReturnValue([load, load, load]);
  vi.mocked(platform).mockReturnValue(os);
  vi.mocked(arch).mockReturnValue(architecture);
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getSystemStats", () => {
  it("returns correct system shape", () => {
    mockSystem();
    const stats = getSystemStats();

    expect(stats).toEqual({
      platform: "darwin",
      arch: "arm64",
      cpuCores: 8,
      cpuModel: "Apple M1",
      cpuLoadPercent: 25,
      totalMemoryMb: 16384,
      freeMemoryMb: 8192,
      memoryUsagePercent: 50,
    });
  });

  it("computes memory usage percentage", () => {
    mockSystem({ totalMb: 10000, freeMb: 3000 });
    const stats = getSystemStats();

    expect(stats.memoryUsagePercent).toBe(70);
  });

  it("caps cpu load at 100%", () => {
    mockSystem({ cores: 2, load: 10.0 });
    const stats = getSystemStats();

    expect(stats.cpuLoadPercent).toBe(100);
  });

  it("uses availableParallelism as primary core count source", () => {
    mockSystem({ cores: 4 });
    vi.mocked(cpus).mockReturnValue(
      Array.from({ length: 8 }, () => ({
        model: "Intel",
        speed: 3000,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      })),
    );

    const stats = getSystemStats();

    expect(stats.cpuCores).toBe(4);
  });

  it("falls back to cpus().length when availableParallelism throws", () => {
    mockSystem({ cores: 8 });
    vi.mocked(availableParallelism).mockImplementation(() => {
      throw new Error("not supported");
    });

    const stats = getSystemStats();

    expect(stats.cpuCores).toBe(8);
  });

  it("falls back to navigator.hardwareConcurrency when os APIs fail", () => {
    mockSystem({ load: 0 });
    vi.mocked(availableParallelism).mockImplementation(() => {
      throw new Error("not supported");
    });
    vi.mocked(cpus).mockReturnValue([]);
    vi.stubGlobal("navigator", { hardwareConcurrency: 6 });

    const stats = getSystemStats();

    expect(stats.cpuCores).toBe(6);
    expect(stats.cpuModel).toBe("unknown");
  });

  it("falls back to 1 core when all sources unavailable", () => {
    mockSystem({ load: 0 });
    vi.mocked(availableParallelism).mockImplementation(() => {
      throw new Error("not supported");
    });
    vi.mocked(cpus).mockReturnValue([]);
    vi.stubGlobal("navigator", undefined);

    const stats = getSystemStats();

    expect(stats.cpuCores).toBe(1);
    expect(stats.cpuLoadPercent).toBe(0);
    expect(stats.cpuModel).toBe("unknown");
  });

  it("handles zero total memory without NaN", () => {
    mockSystem({ totalMb: 0, freeMb: 0 });
    const stats = getSystemStats();

    expect(stats.memoryUsagePercent).toBe(0);
    expect(Number.isNaN(stats.memoryUsagePercent)).toBe(false);
  });

  it("clamps free memory to total memory", () => {
    mockSystem({ totalMb: 8192, freeMb: 16384 });
    const stats = getSystemStats();

    expect(stats.freeMemoryMb).toBeLessThanOrEqual(stats.totalMemoryMb);
    expect(stats.memoryUsagePercent).toBeGreaterThanOrEqual(0);
  });

  it("handles windows-style zero loadavg", () => {
    mockSystem({ cores: 8, load: 0 });
    const stats = getSystemStats();

    expect(stats.cpuLoadPercent).toBe(0);
  });

  it("reports platform and arch", () => {
    mockSystem({ os: "linux", architecture: "x64" });
    const stats = getSystemStats();

    expect(stats.platform).toBe("linux");
    expect(stats.arch).toBe("x64");
  });
});

describe("estimateBrowserCapacity", () => {
  it("always returns at least 1 browser", () => {
    mockSystem({ cores: 1, freeMb: 10, load: 0.9 });
    const { maxBrowsers } = estimateBrowserCapacity();

    expect(maxBrowsers).toBeGreaterThanOrEqual(1);
  });

  it("identifies memory as bottleneck when memory is scarce", () => {
    mockSystem({ cores: 16, freeMb: 200, load: 0 });
    const { bottleneck } = estimateBrowserCapacity();

    expect(bottleneck).toBe("memory");
  });

  it("identifies cpu as bottleneck when cpu is loaded", () => {
    mockSystem({ cores: 2, freeMb: 32768, load: 1.5 });
    const { bottleneck } = estimateBrowserCapacity();

    expect(bottleneck).toBe("cpu");
  });

  it("computes memory-bound capacity correctly", () => {
    mockSystem({ cores: 64, freeMb: 1000, load: 0 });
    const { maxBrowsers } = estimateBrowserCapacity();

    const expected = Math.floor((1000 * MEMORY_SAFETY_RATIO) / BROWSER_MEMORY_OVERHEAD_MB);
    expect(maxBrowsers).toBe(expected);
  });

  it("computes cpu-bound capacity correctly", () => {
    mockSystem({ cores: 4, freeMb: 32768, load: 2.0 });
    const { maxBrowsers, bottleneck } = estimateBrowserCapacity();

    expect(bottleneck).toBe("cpu");
    expect(maxBrowsers).toBe(2);
  });

  it("includes full system stats in result", () => {
    mockSystem();
    const { system } = estimateBrowserCapacity();

    expect(system.cpuCores).toBe(8);
    expect(system.totalMemoryMb).toBe(16384);
    expect(system.platform).toBe("darwin");
  });

  it("scales down with high cpu load", () => {
    mockSystem({ cores: 8, freeMb: 32768, load: 0 });
    const idle = estimateBrowserCapacity();

    mockSystem({ cores: 8, freeMb: 32768, load: 6.0 });
    const loaded = estimateBrowserCapacity();

    expect(loaded.maxBrowsers).toBeLessThan(idle.maxBrowsers);
  });

  it("returns at least 1 browser with zero free memory", () => {
    mockSystem({ cores: 4, freeMb: 0, load: 0 });
    const { maxBrowsers } = estimateBrowserCapacity();

    expect(maxBrowsers).toBeGreaterThanOrEqual(1);
  });

  it("works with navigator fallback for capacity", () => {
    mockSystem({ freeMb: 32768, load: 0 });
    vi.mocked(availableParallelism).mockImplementation(() => {
      throw new Error("not supported");
    });
    vi.mocked(cpus).mockReturnValue([]);
    vi.stubGlobal("navigator", { hardwareConcurrency: 12 });

    const { system, maxBrowsers } = estimateBrowserCapacity();

    expect(system.cpuCores).toBe(12);
    expect(maxBrowsers).toBeGreaterThanOrEqual(1);
  });
});
