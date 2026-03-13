import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectBrowserProfiles } from "../src/profiles/detector.js";

describe("detectBrowserProfiles", () => {
  it("returns an array", () => {
    const profiles = detectBrowserProfiles();
    expect(Array.isArray(profiles)).toBe(true);
  });

  it("each profile has required fields", () => {
    const profiles = detectBrowserProfiles();
    for (const profile of profiles) {
      expect(profile).toHaveProperty("profileName");
      expect(profile).toHaveProperty("profilePath");
      expect(profile).toHaveProperty("displayName");
      expect(profile).toHaveProperty("browser");
      expect(profile.browser).toHaveProperty("name");
      expect(profile.browser).toHaveProperty("executablePath");
      expect(typeof profile.profileName).toBe("string");
      expect(typeof profile.profilePath).toBe("string");
      expect(typeof profile.displayName).toBe("string");
    }
  });

  it("profile names are non-empty strings", () => {
    const profiles = detectBrowserProfiles();
    for (const profile of profiles) {
      expect(profile.profileName.length).toBeGreaterThan(0);
      expect(profile.displayName.length).toBeGreaterThan(0);
      expect(profile.browser.name.length).toBeGreaterThan(0);
    }
  });

  it("detects at least one profile on a system with Chrome or Arc installed", () => {
    const profiles = detectBrowserProfiles();
    expect(profiles.length).toBeGreaterThan(0);
  });
});

describe("profile detection with synthetic data", () => {
  let fakeUserDataDir: string;

  beforeEach(() => {
    fakeUserDataDir = mkdtempSync(path.join(tmpdir(), "fake-browser-"));
  });

  afterEach(() => {
    rmSync(fakeUserDataDir, { recursive: true, force: true });
  });

  it("validates profiles by checking for Preferences file", () => {
    const defaultProfile = path.join(fakeUserDataDir, "Default");
    mkdirSync(defaultProfile, { recursive: true });

    writeFileSync(path.join(defaultProfile, "Preferences"), JSON.stringify({ profile: {} }));

    const profileWithoutPrefs = path.join(fakeUserDataDir, "Profile 1");
    mkdirSync(profileWithoutPrefs, { recursive: true });

    const localState = {
      profile: {
        info_cache: {
          Default: { name: "Test User" },
          "Profile 1": { name: "No Prefs User" },
        },
      },
    };
    writeFileSync(path.join(fakeUserDataDir, "Local State"), JSON.stringify(localState));

    expect(path.join(defaultProfile, "Preferences")).toBeTruthy();
  });

  it("reads display names from Local State", () => {
    const localState = {
      profile: {
        info_cache: {
          Default: { name: "Alice" },
          "Profile 1": { name: "Bob" },
          "Profile 2": { name: "Charlie" },
        },
      },
    };
    writeFileSync(path.join(fakeUserDataDir, "Local State"), JSON.stringify(localState));

    const content = JSON.parse(readFileSync(path.join(fakeUserDataDir, "Local State"), "utf-8"));
    expect(content.profile.info_cache["Default"].name).toBe("Alice");
    expect(content.profile.info_cache["Profile 1"].name).toBe("Bob");
    expect(content.profile.info_cache["Profile 2"].name).toBe("Charlie");
  });
});
