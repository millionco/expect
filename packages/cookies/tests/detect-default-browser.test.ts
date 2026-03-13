import { describe, expect, it, vi } from "vitest";

vi.mock("default-browser", () => ({
  default: vi.fn(),
}));

import getDefaultBrowser from "default-browser";
import { detectDefaultBrowser } from "../src/utils/detect-default-browser.js";

const mockedGetDefaultBrowser = vi.mocked(getDefaultBrowser);

describe("detectDefaultBrowser", () => {
  it("maps macOS bundle id to browser key", async () => {
    mockedGetDefaultBrowser.mockResolvedValue({ name: "Google Chrome", id: "com.google.chrome" });
    expect(await detectDefaultBrowser()).toBe("chrome");
  });

  it("maps Safari bundle id", async () => {
    mockedGetDefaultBrowser.mockResolvedValue({ name: "Safari", id: "com.apple.Safari" });
    expect(await detectDefaultBrowser()).toBe("safari");
  });

  it("maps Firefox bundle id", async () => {
    mockedGetDefaultBrowser.mockResolvedValue({ name: "Firefox", id: "org.mozilla.firefox" });
    expect(await detectDefaultBrowser()).toBe("firefox");
  });

  it("maps Edge Windows fake id", async () => {
    mockedGetDefaultBrowser.mockResolvedValue({ name: "Edge", id: "com.microsoft.edge" });
    expect(await detectDefaultBrowser()).toBe("edge");
  });

  it("maps Edge macOS bundle id", async () => {
    mockedGetDefaultBrowser.mockResolvedValue({ name: "Microsoft Edge", id: "com.microsoft.edgemac" });
    expect(await detectDefaultBrowser()).toBe("edge");
  });

  it("maps Brave bundle id", async () => {
    mockedGetDefaultBrowser.mockResolvedValue({ name: "Brave Browser", id: "com.brave.Browser" });
    expect(await detectDefaultBrowser()).toBe("brave");
  });

  it("maps Linux desktop file id", async () => {
    mockedGetDefaultBrowser.mockResolvedValue({ name: "Google Chrome", id: "google-chrome.desktop" });
    expect(await detectDefaultBrowser()).toBe("chrome");
  });

  it("maps Linux Firefox desktop file", async () => {
    mockedGetDefaultBrowser.mockResolvedValue({ name: "Firefox", id: "firefox.desktop" });
    expect(await detectDefaultBrowser()).toBe("firefox");
  });

  it("returns null for unknown browser id", async () => {
    mockedGetDefaultBrowser.mockResolvedValue({ name: "Unknown", id: "com.unknown.browser" });
    expect(await detectDefaultBrowser()).toBeNull();
  });

  it("returns null when library throws", async () => {
    mockedGetDefaultBrowser.mockRejectedValue(new Error("unsupported platform"));
    expect(await detectDefaultBrowser()).toBeNull();
  });

  it("handles case-insensitive bundle ids", async () => {
    mockedGetDefaultBrowser.mockResolvedValue({ name: "Chrome", id: "COM.GOOGLE.CHROME" });
    expect(await detectDefaultBrowser()).toBe("chrome");
  });
});
