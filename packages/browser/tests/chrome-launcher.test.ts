import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ChildProcess } from "node:child_process";

const { platformMock, existsSyncMock, rmSyncMock, whichSyncMock } = vi.hoisted(() => ({
  platformMock: vi.fn(),
  existsSyncMock: vi.fn(),
  rmSyncMock: vi.fn(),
  whichSyncMock: vi.fn(),
}));

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return { ...original, platform: platformMock };
});

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return { ...original, existsSync: existsSyncMock, rmSync: rmSyncMock };
});

vi.mock("which", () => ({
  default: { sync: whichSyncMock },
}));

import { Effect } from "effect";
import { findSystemChrome, killChromeProcess } from "../src/chrome-launcher";
import { ChromeNotFoundError } from "../src/errors";

describe("findSystemChrome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
    whichSyncMock.mockReturnValue(null);
  });

  it("finds Google Chrome on macOS", async () => {
    platformMock.mockReturnValue("darwin");
    existsSyncMock.mockImplementation(
      (filePath: string) =>
        filePath === "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    );

    const result = await Effect.runPromise(findSystemChrome());

    expect(result).toBe("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  });

  it("returns first available browser on macOS", async () => {
    platformMock.mockReturnValue("darwin");
    existsSyncMock.mockImplementation(
      (filePath: string) =>
        filePath === "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    );

    const result = await Effect.runPromise(findSystemChrome());

    expect(result).toBe("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser");
  });

  it("finds Chrome on Linux via which", async () => {
    platformMock.mockReturnValue("linux");
    whichSyncMock.mockImplementation((name: string) =>
      name === "google-chrome" ? "/usr/bin/google-chrome" : null,
    );

    const result = await Effect.runPromise(findSystemChrome());

    expect(result).toBe("/usr/bin/google-chrome");
    expect(whichSyncMock).toHaveBeenCalledWith("google-chrome", { nothrow: true });
  });

  it("tries candidates in priority order on Linux", async () => {
    platformMock.mockReturnValue("linux");
    whichSyncMock.mockImplementation((name: string) =>
      name === "chromium" ? "/usr/bin/chromium" : null,
    );

    const result = await Effect.runPromise(findSystemChrome());

    expect(result).toBe("/usr/bin/chromium");
    expect(whichSyncMock).toHaveBeenNthCalledWith(1, "google-chrome", { nothrow: true });
    expect(whichSyncMock).toHaveBeenNthCalledWith(2, "google-chrome-stable", { nothrow: true });
    expect(whichSyncMock).toHaveBeenNthCalledWith(3, "chromium-browser", { nothrow: true });
    expect(whichSyncMock).toHaveBeenNthCalledWith(4, "chromium", { nothrow: true });
  });

  it("fails with ChromeNotFoundError when no browser is found on macOS", async () => {
    platformMock.mockReturnValue("darwin");

    const error = await Effect.runPromise(Effect.flip(findSystemChrome()));

    expect(error).toBeInstanceOf(ChromeNotFoundError);
  });

  it("fails with ChromeNotFoundError when no browser is found on Linux", async () => {
    platformMock.mockReturnValue("linux");

    const error = await Effect.runPromise(Effect.flip(findSystemChrome()));

    expect(error).toBeInstanceOf(ChromeNotFoundError);
  });

  it("fails with ChromeNotFoundError on unsupported platform", async () => {
    platformMock.mockReturnValue("freebsd");

    const error = await Effect.runPromise(Effect.flip(findSystemChrome()));

    expect(error).toBeInstanceOf(ChromeNotFoundError);
  });
});

describe("killChromeProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("kills process and removes temp dir", async () => {
    const killMock = vi.fn(() => true);
    const chrome = {
      process: { kill: killMock } as unknown as ChildProcess,
      wsUrl: "ws://127.0.0.1:9222/devtools/browser/abc",
      userDataDir: "/tmp/expect-chrome-abc123",
      tempUserDataDir: "/tmp/expect-chrome-abc123",
    };

    await Effect.runPromise(killChromeProcess(chrome));

    expect(killMock).toHaveBeenCalledOnce();
    expect(rmSyncMock).toHaveBeenCalledWith("/tmp/expect-chrome-abc123", {
      recursive: true,
      force: true,
    });
  });

  it("skips temp dir removal when no temp dir exists", async () => {
    const killMock = vi.fn(() => true);
    const chrome = {
      process: { kill: killMock } as unknown as ChildProcess,
      wsUrl: "ws://127.0.0.1:9222/devtools/browser/abc",
      userDataDir: "/home/user/.config/google-chrome",
      tempUserDataDir: undefined,
    };

    await Effect.runPromise(killChromeProcess(chrome));

    expect(killMock).toHaveBeenCalledOnce();
    expect(rmSyncMock).not.toHaveBeenCalled();
  });

  it("continues gracefully when process.kill throws", async () => {
    const killMock = vi.fn(() => {
      throw new Error("No such process");
    });
    const chrome = {
      process: { kill: killMock } as unknown as ChildProcess,
      wsUrl: "ws://127.0.0.1:9222/devtools/browser/abc",
      userDataDir: "/tmp/expect-chrome-abc123",
      tempUserDataDir: "/tmp/expect-chrome-abc123",
    };

    await Effect.runPromise(killChromeProcess(chrome));

    expect(killMock).toHaveBeenCalledOnce();
    expect(rmSyncMock).toHaveBeenCalledOnce();
  });

  it("continues gracefully when rmSync throws", async () => {
    const killMock = vi.fn(() => true);
    rmSyncMock.mockImplementation(() => {
      throw new Error("EPERM");
    });
    const chrome = {
      process: { kill: killMock } as unknown as ChildProcess,
      wsUrl: "ws://127.0.0.1:9222/devtools/browser/abc",
      userDataDir: "/tmp/expect-chrome-abc123",
      tempUserDataDir: "/tmp/expect-chrome-abc123",
    };

    await Effect.runPromise(killChromeProcess(chrome));

    expect(killMock).toHaveBeenCalledOnce();
    expect(rmSyncMock).toHaveBeenCalledOnce();
  });
});
