import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  defaultBrowserMock,
  browserListMock,
  cookieExtractMock,
  launchMock,
  newContextMock,
  addCookiesMock,
  addInitScriptMock,
  pagesMock,
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
  pagesMock: vi.fn(),
  newPageMock: vi.fn(),
  gotoMock: vi.fn(),
  closeMock: vi.fn(),
}));

vi.mock("@expect/cookies", async () => {
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

import { Effect, Layer, Option } from "effect";
import { Playwright } from "../src/playwright";
import { Artifacts } from "../src/artifacts";

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

const playwrightLayer = Playwright.layer.pipe(Layer.provide(Artifacts.layer));

const openWithCookies = (url: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const pw = yield* Playwright;
      yield* pw.open(url, { cookies: true });
      yield* pw.close();
    }).pipe(Effect.provide(playwrightLayer)),
  );

describe("Playwright.open cookie reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    gotoMock.mockResolvedValue(undefined);
    newPageMock.mockResolvedValue({
      goto: gotoMock,
      on: vi.fn(),
      evaluate: vi.fn().mockResolvedValue(undefined),
      isClosed: vi.fn().mockReturnValue(false),
    });
    addCookiesMock.mockResolvedValue(undefined);
    addInitScriptMock.mockResolvedValue(undefined);
    pagesMock.mockReturnValue([]);
    newContextMock.mockResolvedValue({
      newPage: newPageMock,
      addCookies: addCookiesMock,
      addInitScript: addInitScriptMock,
      pages: pagesMock,
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

  it("extracts cookies from all profiles of the same browser", async () => {
    cookieExtractMock.mockReturnValue(Effect.succeed(profileCookies));

    await openWithCookies("https://github.com");

    expect(newContextMock).toHaveBeenCalledWith({ locale: "en-US" });
    expect(cookieExtractMock).toHaveBeenCalledWith(heliumProfile);
    expect(cookieExtractMock).toHaveBeenCalledWith(workProfile);
    expect(addCookiesMock).toHaveBeenCalledWith(
      profileCookies.map((cookie) => cookie.playwrightFormat),
    );
  });

  it("merges unique cookies across profiles", async () => {
    const workCookies = [
      mockCookie({
        name: "wos-session",
        value: "work-session-token",
        domain: "localhost",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      }),
    ];

    cookieExtractMock.mockImplementation((profile: unknown) => {
      if (profile === heliumProfile) return Effect.succeed(profileCookies);
      return Effect.succeed(workCookies);
    });

    await openWithCookies("https://github.com");

    expect(addCookiesMock).toHaveBeenCalledWith(
      [...profileCookies, ...workCookies].map((cookie) => cookie.playwrightFormat),
    );
  });

  it("preferred profile cookies win when duplicates exist across profiles", async () => {
    const preferredVersion = [
      mockCookie({
        name: "session",
        value: "preferred-value",
        domain: "example.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      }),
    ];

    const otherVersion = [
      mockCookie({
        name: "session",
        value: "other-value",
        domain: "example.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      }),
    ];

    cookieExtractMock.mockImplementation((profile: unknown) => {
      if (profile === heliumProfile) return Effect.succeed(preferredVersion);
      return Effect.succeed(otherVersion);
    });

    await openWithCookies("https://github.com");

    expect(addCookiesMock).toHaveBeenCalledWith(
      preferredVersion.map((cookie) => cookie.playwrightFormat),
    );
  });

  it("uses other profiles when preferred returns no cookies", async () => {
    cookieExtractMock.mockImplementation((profile: unknown) => {
      if (profile === heliumProfile) return Effect.succeed([]);
      return Effect.succeed(fallbackCookies);
    });

    await openWithCookies("https://github.com");

    expect(addCookiesMock).toHaveBeenCalledWith(
      fallbackCookies.map((cookie) => cookie.playwrightFormat),
    );
  });
});
