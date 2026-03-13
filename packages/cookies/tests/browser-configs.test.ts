import { describe, expect, it } from "vitest";
import { PROFILE_BROWSER_CONFIGS } from "../src/profiles/constants.js";
import { getUserDataDir } from "../src/profiles/detector.js";
import { CHROMIUM_SQLITE_CONFIGS } from "../src/sqlite/constants.js";
import { SUPPORTED_BROWSERS } from "../src/sqlite/extract.js";
import type { ChromiumBrowser } from "../src/types.js";
import { browserDisplayNameToKey } from "../src/utils/browser-name-map.js";

const CHROMIUM_BROWSER_KEYS = Object.keys(CHROMIUM_SQLITE_CONFIGS) as ChromiumBrowser[];

describe("CHROMIUM_SQLITE_CONFIGS", () => {
  it("has 18 browser entries", () => {
    expect(CHROMIUM_BROWSER_KEYS.length).toBe(18);
  });

  for (const browserKey of CHROMIUM_BROWSER_KEYS) {
    describe(browserKey, () => {
      const config = CHROMIUM_SQLITE_CONFIGS[browserKey];

      it("has a non-empty keychainService", () => {
        expect(config.keychainService.length).toBeGreaterThan(0);
      });

      it("has a non-empty linuxSecretLabel", () => {
        expect(config.linuxSecretLabel.length).toBeGreaterThan(0);
      });

      it("has a darwin cookie path under Library/Application Support", () => {
        expect(config.cookiePaths["darwin"]).toMatch(/^Library\/Application Support\//);
      });

      it("has a linux cookie path under .config", () => {
        expect(config.cookiePaths["linux"]).toMatch(/^\.config\//);
      });

      it("has a win32 cookie path under AppData", () => {
        expect(config.cookiePaths["win32"]).toMatch(/^AppData\//);
      });

      it("has a non-empty localStatePath", () => {
        expect(config.localStatePath.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("PROFILE_BROWSER_CONFIGS", () => {
  it("has 18 browser entries", () => {
    expect(PROFILE_BROWSER_CONFIGS.length).toBe(18);
  });

  for (const config of PROFILE_BROWSER_CONFIGS) {
    describe(config.info.name, () => {
      it("has a non-empty executable path", () => {
        expect(config.info.executablePath.length).toBeGreaterThan(0);
      });

      it("has a non-empty darwinUserDataPath", () => {
        expect(config.darwinUserDataPath.length).toBeGreaterThan(0);
      });

      it("has a non-empty linuxUserDataPath", () => {
        expect(config.linuxUserDataPath.length).toBeGreaterThan(0);
      });

      it("has a non-empty win32UserDataPath", () => {
        expect(config.win32UserDataPath.length).toBeGreaterThan(0);
      });

      it("has at least one win32ExecutablePath", () => {
        expect(config.win32ExecutablePaths.length).toBeGreaterThan(0);
      });

      it("has a non-empty registryKey", () => {
        expect(config.registryKey.length).toBeGreaterThan(0);
      });

      it("maps to a valid Browser key", () => {
        const browserKey = browserDisplayNameToKey(config.info.name);
        expect(browserKey).toBeDefined();
        expect(CHROMIUM_BROWSER_KEYS).toContain(browserKey);
      });
    });
  }
});

describe("SUPPORTED_BROWSERS", () => {
  it("includes all chromium browsers", () => {
    for (const key of CHROMIUM_BROWSER_KEYS) {
      expect(SUPPORTED_BROWSERS).toContain(key);
    }
  });

  it("includes firefox and safari", () => {
    expect(SUPPORTED_BROWSERS).toContain("firefox");
    expect(SUPPORTED_BROWSERS).toContain("safari");
  });

  it("has 20 entries total", () => {
    expect(SUPPORTED_BROWSERS.length).toBe(20);
  });
});

describe("getUserDataDir", () => {
  const sampleConfig = {
    darwinUserDataPath: "Google/Chrome",
    linuxUserDataPath: "google-chrome",
    win32UserDataPath: "Google\\Chrome\\User Data",
  };

  it("returns a path containing Application Support for darwin", () => {
    const result = getUserDataDir("darwin", sampleConfig);
    expect(result).toContain("Library/Application Support/Google/Chrome");
  });

  it("returns a path containing .config for linux", () => {
    const result = getUserDataDir("linux", sampleConfig);
    expect(result).toContain(".config/google-chrome");
  });

  it("returns a path containing AppData or User Data for win32", () => {
    const result = getUserDataDir("win32", sampleConfig);
    expect(result).toBeDefined();
    expect(result).toContain("Google");
  });

  it("returns null for unsupported platforms", () => {
    expect(getUserDataDir("freebsd", sampleConfig)).toBeNull();
    expect(getUserDataDir("android", sampleConfig)).toBeNull();
  });
});

describe("browserDisplayNameToKey", () => {
  it("maps all profile browser display names to valid keys", () => {
    for (const config of PROFILE_BROWSER_CONFIGS) {
      const key = browserDisplayNameToKey(config.info.name);
      expect(key).toBeDefined();
    }
  });

  it("returns undefined for unknown display names", () => {
    expect(browserDisplayNameToKey("Unknown Browser")).toBeUndefined();
    expect(browserDisplayNameToKey("")).toBeUndefined();
  });
});
