import { describe, expect, it } from "vite-plus/test";

import {
  BROWSER_CONFIGS,
  CHROMIUM_CONFIGS,
  FIREFOX_CONFIG,
  SAFARI_CONFIG,
  chromiumConfig,
  configByBundleId,
  configByDesktopFile,
  configByDisplayName,
  configByKey,
} from "../src/browser-config";

describe("BROWSER_CONFIGS", () => {
  it("has 20 entries (18 chromium + firefox + safari)", () => {
    expect(BROWSER_CONFIGS.length).toBe(20);
  });

  it("has unique keys", () => {
    const keys = BROWSER_CONFIGS.map((config) => config.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("has unique display names", () => {
    const names = BROWSER_CONFIGS.map((config) => config.displayName);
    expect(names.length).toBe(new Set(names).size);
  });

  it("contains all expected browsers", () => {
    const keys = BROWSER_CONFIGS.map((config) => config.key);
    expect(keys).toContain("chrome");
    expect(keys).toContain("firefox");
    expect(keys).toContain("safari");
    expect(keys).toContain("edge");
    expect(keys).toContain("brave");
    expect(keys).toContain("arc");
  });
});

describe("CHROMIUM_CONFIGS", () => {
  it("has 18 entries", () => {
    expect(CHROMIUM_CONFIGS.length).toBe(18);
  });

  for (const config of CHROMIUM_CONFIGS) {
    describe(config.key, () => {
      it("has a non-empty keychainService", () => {
        expect(config.keychainService.length).toBeGreaterThan(0);
      });

      it("has a non-empty linuxSecretLabel", () => {
        expect(config.linuxSecretLabel.length).toBeGreaterThan(0);
      });

      it("has a non-empty displayName", () => {
        expect(config.displayName.length).toBeGreaterThan(0);
      });

      it("has a non-empty bundleId", () => {
        expect(config.bundleId.length).toBeGreaterThan(0);
      });

      it("has darwin cookie path", () => {
        expect(config.cookieRelativePath.darwin.length).toBeGreaterThan(0);
      });

      it("has linux cookie path", () => {
        expect(config.cookieRelativePath.linux.length).toBeGreaterThan(0);
      });

      it("has win32 cookie path", () => {
        expect(config.cookieRelativePath.win32.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("configByKey", () => {
  it("finds chrome", () => {
    expect(configByKey("chrome")?.displayName).toBe("Google Chrome");
  });

  it("finds firefox", () => {
    expect(configByKey("firefox")?.displayName).toBe("Firefox");
  });

  it("finds safari", () => {
    expect(configByKey("safari")?.displayName).toBe("Safari");
  });

  it("returns undefined for unknown key", () => {
    expect(configByKey("nonexistent" as any)).toBeUndefined();
  });
});

describe("configByBundleId", () => {
  it("maps com.google.chrome to chrome", () => {
    expect(configByBundleId("com.google.chrome")?.key).toBe("chrome");
  });

  it("maps com.apple.safari to safari", () => {
    expect(configByBundleId("com.apple.safari")?.key).toBe("safari");
  });

  it("is case insensitive", () => {
    expect(configByBundleId("COM.GOOGLE.CHROME")?.key).toBe("chrome");
  });

  it("returns undefined for unknown bundle id", () => {
    expect(configByBundleId("com.unknown.browser")).toBeUndefined();
  });

  it("handles both Edge bundle IDs", () => {
    expect(configByBundleId("com.microsoft.edgemac")?.key).toBe("edge");
    expect(configByBundleId("com.microsoft.edge")?.key).toBe("edge");
  });
});

describe("configByDesktopFile", () => {
  it("maps google-chrome to chrome", () => {
    expect(configByDesktopFile("google-chrome")?.key).toBe("chrome");
  });

  it("strips .desktop suffix", () => {
    expect(configByDesktopFile("google-chrome.desktop")?.key).toBe("chrome");
  });

  it("returns undefined for unknown desktop file", () => {
    expect(configByDesktopFile("unknown-browser")).toBeUndefined();
  });
});

describe("configByDisplayName", () => {
  it("maps Google Chrome", () => {
    expect(configByDisplayName("Google Chrome")?.key).toBe("chrome");
  });

  it("maps Firefox", () => {
    expect(configByDisplayName("Firefox")?.key).toBe("firefox");
  });

  it("maps Safari", () => {
    expect(configByDisplayName("Safari")?.key).toBe("safari");
  });

  it("maps every chromium config display name", () => {
    for (const config of CHROMIUM_CONFIGS) {
      const result = configByDisplayName(config.displayName);
      expect(result).toBeDefined();
      expect(result!.key).toBe(config.key);
    }
  });

  it("returns undefined for unknown display name", () => {
    expect(configByDisplayName("Unknown Browser")).toBeUndefined();
  });
});

describe("chromiumConfig", () => {
  it("returns config for chrome", () => {
    const config = chromiumConfig("chrome");
    expect(config.displayName).toBe("Google Chrome");
    expect(config.kind).toBe("chromium");
  });
});

describe("FIREFOX_CONFIG", () => {
  it("has correct key", () => {
    expect(FIREFOX_CONFIG.key).toBe("firefox");
  });

  it("has kind firefox", () => {
    expect(FIREFOX_CONFIG.kind).toBe("firefox");
  });

  it("has data dir paths for all platforms", () => {
    expect(FIREFOX_CONFIG.dataDir.darwin.length).toBeGreaterThan(0);
    expect(FIREFOX_CONFIG.dataDir.linux.length).toBeGreaterThan(0);
    expect(FIREFOX_CONFIG.dataDir.win32.length).toBeGreaterThan(0);
  });
});

describe("SAFARI_CONFIG", () => {
  it("has correct key", () => {
    expect(SAFARI_CONFIG.key).toBe("safari");
  });

  it("has kind safari", () => {
    expect(SAFARI_CONFIG.kind).toBe("safari");
  });

  it("has cookie relative paths", () => {
    expect(SAFARI_CONFIG.cookieRelativePaths.length).toBeGreaterThan(0);
  });
});
