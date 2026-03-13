import { describe, expect, it } from "vitest";
import { detectBrowserProfiles } from "../src/profiles/detector.js";
import { extractAllProfileCookies, extractProfileCookies } from "../src/profiles/extract.js";

const INTEGRATION_TIMEOUT_MS = 30_000;

describe("extractProfileCookies", () => {
  it(
    "extracts cookies from the first detected profile",
    async () => {
      const profiles = detectBrowserProfiles();
      expect(profiles.length).toBeGreaterThan(0);

      const firstProfile = profiles[0]!;
      const result = await extractProfileCookies({ profile: firstProfile });

      expect(result).toHaveProperty("cookies");
      expect(result).toHaveProperty("warnings");
      expect(Array.isArray(result.cookies)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "returns cookies with correct shape including browser field",
    async () => {
      const profiles = detectBrowserProfiles();
      const firstProfile = profiles[0]!;
      const { cookies } = await extractProfileCookies({ profile: firstProfile });

      for (const cookie of cookies) {
        expect(typeof cookie.name).toBe("string");
        expect(typeof cookie.value).toBe("string");
        expect(typeof cookie.domain).toBe("string");
        expect(typeof cookie.path).toBe("string");
        expect(typeof cookie.secure).toBe("boolean");
        expect(typeof cookie.httpOnly).toBe("boolean");
        expect(typeof cookie.browser).toBe("string");

        if (cookie.expires !== undefined) {
          expect(typeof cookie.expires).toBe("number");
          expect(cookie.expires).toBeGreaterThan(0);
        }

        if (cookie.sameSite !== undefined) {
          expect(["Strict", "Lax", "None"]).toContain(cookie.sameSite);
        }
      }
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "accepts a custom port",
    async () => {
      const profiles = detectBrowserProfiles();
      const firstProfile = profiles[0]!;
      const result = await extractProfileCookies({ profile: firstProfile, port: 9444 });

      expect(result).toHaveProperty("cookies");
      expect(result).toHaveProperty("warnings");
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "returns a warning for a profile with a nonexistent browser path",
    async () => {
      const fakeProfile = {
        profileName: "Default",
        profilePath: "/tmp/nonexistent-profile",
        displayName: "Fake Profile",
        browser: {
          name: "FakeBrowser",
          executablePath: "/usr/bin/nonexistent-browser",
        },
      };

      const result = await extractProfileCookies({ profile: fakeProfile });

      expect(result.cookies).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("Fake Profile");
    },
    INTEGRATION_TIMEOUT_MS,
  );
});

describe("extractAllProfileCookies", () => {
  it(
    "aggregates results from multiple profiles",
    async () => {
      const profiles = detectBrowserProfiles();
      const firstTwo = profiles.slice(0, 2);

      if (firstTwo.length < 2) {
        return;
      }

      const result = await extractAllProfileCookies(firstTwo);

      expect(result).toHaveProperty("cookies");
      expect(result).toHaveProperty("warnings");
      expect(Array.isArray(result.cookies)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    },
    INTEGRATION_TIMEOUT_MS * 2,
  );

  it("returns empty result for empty profile list", async () => {
    const result = await extractAllProfileCookies([]);

    expect(result.cookies).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
