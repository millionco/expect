import type { BrowserProfile, Cookie } from "@browser-tester/cookies";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VIDEO_HEIGHT_PX, DEFAULT_VIDEO_WIDTH_PX } from "../src/constants";

const {
  detectBrowserProfilesMock,
  detectDefaultBrowserMock,
  extractProfileCookiesMock,
  extractCookiesMock,
  toPlaywrightCookiesMock,
  launchMock,
  newContextMock,
  addCookiesMock,
  newPageMock,
  gotoMock,
  closeMock,
} = vi.hoisted(() => ({
  detectBrowserProfilesMock: vi.fn(),
  detectDefaultBrowserMock: vi.fn(),
  extractProfileCookiesMock: vi.fn(),
  extractCookiesMock: vi.fn(),
  toPlaywrightCookiesMock: vi.fn((cookies: Cookie[]) => cookies),
  launchMock: vi.fn(),
  newContextMock: vi.fn(),
  addCookiesMock: vi.fn(),
  newPageMock: vi.fn(),
  gotoMock: vi.fn(),
  closeMock: vi.fn(),
}));

vi.mock("@browser-tester/cookies", () => ({
  detectBrowserProfiles: detectBrowserProfilesMock,
  detectDefaultBrowser: detectDefaultBrowserMock,
  extractProfileCookies: extractProfileCookiesMock,
  extractCookies: extractCookiesMock,
  toPlaywrightCookies: toPlaywrightCookiesMock,
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: launchMock,
  },
}));

import { runBrowser } from "../src/browser";

const testCookies: Cookie[] = [
  Cookie.make({
    name: "__Host-session",
    value: "profile-cookie",
    domain: "github.com",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
  }),
];

const fallbackCookies: Cookie[] = [
  {
    name: "fallback-session",
    value: "sqlite-cookie",
    domain: "github.com",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    browser: "helium",
  },
];

describe("Browser.createPage cookie reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    gotoMock.mockResolvedValue(undefined);
    newPageMock.mockResolvedValue({ goto: gotoMock });
    addCookiesMock.mockResolvedValue(undefined);
    newContextMock.mockResolvedValue({ newPage: newPageMock, addCookies: addCookiesMock });
    closeMock.mockResolvedValue(undefined);
    launchMock.mockResolvedValue({
      newContext: newContextMock,
      close: closeMock,
    });

    detectDefaultBrowserMock.mockResolvedValue("helium");
    detectBrowserProfilesMock.mockReturnValue([heliumProfile, workProfile]);
    extractProfileCookiesMock.mockResolvedValue({
      cookies: profileCookies,
      warnings: [],
    });
    extractCookiesMock.mockResolvedValue({
      cookies: fallbackCookies,
      warnings: [],
    });
  });

  it("uses the preferred profile cookies before sqlite fallback for the default browser", async () => {
    await runBrowser((browser) => browser.createPage("https://github.com", { cookies: true }));

    expect(detectDefaultBrowserMock).toHaveBeenCalledOnce();
    expect(detectBrowserProfilesMock).toHaveBeenCalledWith({
      browser: "helium",
    });
    expect(extractProfileCookiesMock).toHaveBeenCalledOnce();
    expect(extractProfileCookiesMock).toHaveBeenCalledWith({
      profile: heliumProfile,
    });
    expect(newContextMock).toHaveBeenCalledWith({ locale: "en-US" });
    expect(extractCookiesMock).not.toHaveBeenCalled();
    expect(addCookiesMock).toHaveBeenCalledWith(profileCookies);
  });

  it("falls back to sqlite extraction when profile extraction returns no cookies", async () => {
    extractProfileCookiesMock.mockResolvedValueOnce({
      cookies: [],
      warnings: ["no cookies found in profile: You"],
    });

    await runBrowser((browser) => browser.createPage("https://github.com", { cookies: true }));

    expect(extractCookiesMock).toHaveBeenCalledWith({
      url: "https://github.com",
      browsers: ["helium"],
    });
    expect(addCookiesMock).toHaveBeenCalledWith(fallbackCookies);
  });
});

describe("Browser.createPage video recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    gotoMock.mockResolvedValue(undefined);
    newPageMock.mockResolvedValue({ goto: gotoMock });
    newContextMock.mockResolvedValue({ newPage: newPageMock });
    closeMock.mockResolvedValue(undefined);
    launchMock.mockResolvedValue({
      newContext: newContextMock,
      close: closeMock,
    });
  });

  it("uses the default HD recording size when video is enabled", async () => {
    await runBrowser((browser) => browser.createPage("https://example.com", { video: true }));

    expect(newContextMock).toHaveBeenCalledWith({
      recordVideo: {
        dir: expect.any(String),
        size: {
          width: DEFAULT_VIDEO_WIDTH_PX,
          height: DEFAULT_VIDEO_HEIGHT_PX,
        },
      },
    });
  });

  it("preserves an explicit recording size", async () => {
    await runBrowser((browser) =>
      browser.createPage("https://example.com", {
        video: {
          dir: "/tmp/videos",
          size: {
            width: 1920,
            height: 1080,
          },
        },
      }),
    );

    expect(newContextMock).toHaveBeenCalledWith({
      recordVideo: {
        dir: "/tmp/videos",
        size: {
          width: 1920,
          height: 1080,
        },
      },
    });
  });

  it("fills in the default recording size when only a directory is provided", async () => {
    await runBrowser((browser) =>
      browser.createPage("https://example.com", {
        video: {
          dir: "/tmp/videos",
        },
      }),
    );

    expect(newContextMock).toHaveBeenCalledWith({
      recordVideo: {
        dir: "/tmp/videos",
        size: {
          width: DEFAULT_VIDEO_WIDTH_PX,
          height: DEFAULT_VIDEO_HEIGHT_PX,
        },
      },
    });
  });

});
