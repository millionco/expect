import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  defaultBrowserMock,
  browserListMock,
  cookieExtractMock,
  launchMock,
  newContextMock,
  addCookiesMock,
  addInitScriptMock,
  newPageMock,
  gotoMock,
  closeMock,
} = vi.hoisted(() => ({
  defaultBrowserMock: vi.fn(),
  browserListMock: vi.fn(),
  cookieExtractMock: vi.fn(),
  launchMock: vi.fn(),
  newContextMock: vi.fn(),
  addCookiesMock: vi.fn(),
  addInitScriptMock: vi.fn(),
  newPageMock: vi.fn(),
  gotoMock: vi.fn(),
  closeMock: vi.fn(),
}));

vi.mock("@browser-tester/cookies", async () => {
  const { Effect, Layer, ServiceMap } = await import("effect");

  class Browsers extends ServiceMap.Service<Browsers>()("@cookies/Browsers", {
    make: Effect.succeed({
      defaultBrowser: () => Effect.suspend(() => defaultBrowserMock()),
      list: Effect.suspend(() => browserListMock()),
      register: () => Effect.void,
    }),
  }) {}

  class Cookies extends ServiceMap.Service<Cookies>()("@cookies/Cookies", {
    make: Effect.succeed({
      extract: (profile: unknown) => Effect.suspend(() => cookieExtractMock(profile)),
    }),
  }) {
    static layer = Layer.effect(this, this.make);
  }

  return {
    Browsers,
    Cookies,
    layerLive: Layer.effect(Browsers, Browsers.make),
  };
});

vi.mock("playwright", () => ({
  chromium: {
    launch: launchMock,
  },
}));

import { Effect, Option } from "effect";
import { runBrowser } from "../src/browser";

const heliumProfile = {
  _tag: "ChromiumBrowser" as const,
  key: "helium",
  profileName: "Default",
  profilePath: "/tmp/helium/Default",
  executablePath: "/usr/bin/helium",
  locale: "en-US",
};

const workProfile = {
  _tag: "ChromiumBrowser" as const,
  key: "helium",
  profileName: "Profile 1",
  profilePath: "/tmp/helium/Profile 1",
  executablePath: "/usr/bin/helium",
  locale: "en-US",
};

const mockCookie = (data: Record<string, unknown>) => ({
  ...data,
  get playwrightFormat() {
    const domain = String(data.domain);
    return {
      name: data.name,
      value: data.value,
      domain: domain.startsWith(".") ? domain : `.${domain}`,
      path: data.path,
      expires: -1,
      secure: data.secure,
      httpOnly: data.httpOnly,
      sameSite: data.sameSite,
    };
  },
});

const profileCookies = [
  mockCookie({
    name: "__Host-session",
    value: "profile-cookie",
    domain: "github.com",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
  }),
];

const fallbackCookies = [
  mockCookie({
    name: "fallback-session",
    value: "sqlite-cookie",
    domain: "github.com",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
  }),
];

describe("Browser.createPage cookie reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    gotoMock.mockResolvedValue(undefined);
    newPageMock.mockResolvedValue({ goto: gotoMock });
    addCookiesMock.mockResolvedValue(undefined);
    addInitScriptMock.mockResolvedValue(undefined);
    newContextMock.mockResolvedValue({
      newPage: newPageMock,
      addCookies: addCookiesMock,
      addInitScript: addInitScriptMock,
    });
    closeMock.mockResolvedValue(undefined);
    launchMock.mockResolvedValue({
      newContext: newContextMock,
      close: closeMock,
    });

    defaultBrowserMock.mockReturnValue(Effect.succeed(Option.some(heliumProfile)));
    browserListMock.mockReturnValue(Effect.succeed([heliumProfile, workProfile]));
    cookieExtractMock.mockReturnValue(Effect.succeed(profileCookies));
  });

  it("uses the preferred profile cookies before sqlite fallback for the default browser", async () => {
    await runBrowser((browser) => browser.createPage("https://github.com", { cookies: true }));

    expect(newContextMock).toHaveBeenCalledWith({ locale: "en-US" });
    expect(cookieExtractMock).toHaveBeenCalledWith(heliumProfile);
    expect(addCookiesMock).toHaveBeenCalledWith(
      profileCookies.map((cookie) => cookie.playwrightFormat),
    );
  });

  it("falls back to other profiles when preferred profile extraction returns no cookies", async () => {
    cookieExtractMock.mockImplementation((profile: unknown) => {
      if (profile === heliumProfile) return Effect.succeed([]);
      return Effect.succeed(fallbackCookies);
    });

    await runBrowser((browser) => browser.createPage("https://github.com", { cookies: true }));

    expect(addCookiesMock).toHaveBeenCalledWith(
      fallbackCookies.map((cookie) => cookie.playwrightFormat),
    );
  });
});
