import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  defaultBrowserMock,
  browserListMock,
  cookieExtractMock,
  launchMock,
  connectOverCDPMock,
  newContextMock,
  addCookiesMock,
  addInitScriptMock,
  pagesMock,
  newPageMock,
  gotoMock,
  closeMock,
  autoDiscoverCdpMock,
  launchSystemChromeMock,
  killChromeProcessMock,
} = vi.hoisted(() => ({
  defaultBrowserMock: vi.fn(),
  browserListMock: vi.fn(),
  cookieExtractMock: vi.fn(),
  launchMock: vi.fn(),
  connectOverCDPMock: vi.fn(),
  newContextMock: vi.fn(),
  addCookiesMock: vi.fn(),
  addInitScriptMock: vi.fn(),
  pagesMock: vi.fn(),
  newPageMock: vi.fn(),
  gotoMock: vi.fn(),
  closeMock: vi.fn(),
  autoDiscoverCdpMock: vi.fn(),
  launchSystemChromeMock: vi.fn(),
  killChromeProcessMock: vi.fn(),
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

const webkitLaunchMock = vi.hoisted(() => vi.fn());
const firefoxLaunchMock = vi.hoisted(() => vi.fn());

vi.mock("playwright", () => ({
  chromium: {
    launch: launchMock,
    connectOverCDP: connectOverCDPMock,
  },
  webkit: {
    launch: webkitLaunchMock,
  },
  firefox: {
    launch: firefoxLaunchMock,
  },
}));

vi.mock("../src/cdp-discovery", () => ({
  autoDiscoverCdp: autoDiscoverCdpMock,
}));

vi.mock("../src/chrome-launcher", () => ({
  launchSystemChrome: launchSystemChromeMock,
  killChromeProcess: killChromeProcessMock,
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

    await runBrowser((browser) => browser.createPage("https://github.com", { cookies: true }));

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

    await runBrowser((browser) => browser.createPage("https://github.com", { cookies: true }));

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

    await runBrowser((browser) => browser.createPage("https://github.com", { cookies: true }));

    expect(addCookiesMock).toHaveBeenCalledWith(
      preferredVersion.map((cookie) => cookie.playwrightFormat),
    );
  });

  it("uses other profiles when preferred returns no cookies", async () => {
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

describe("Browser.createPage browserType", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    gotoMock.mockResolvedValue(undefined);
    newPageMock.mockResolvedValue({ goto: gotoMock });
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

    const mockBrowser = {
      newContext: newContextMock,
      close: closeMock,
    };
    launchMock.mockResolvedValue(mockBrowser);
    webkitLaunchMock.mockResolvedValue(mockBrowser);
    firefoxLaunchMock.mockResolvedValue(mockBrowser);

    defaultBrowserMock.mockReturnValue(Effect.succeed(Option.none()));
    browserListMock.mockReturnValue(Effect.succeed([]));
  });

  it("defaults to chromium when browserType is not specified", async () => {
    await runBrowser((browser) => browser.createPage("https://example.com"));

    expect(launchMock).toHaveBeenCalledOnce();
    expect(webkitLaunchMock).not.toHaveBeenCalled();
    expect(firefoxLaunchMock).not.toHaveBeenCalled();
  });

  it("launches webkit when browserType is webkit", async () => {
    await runBrowser((browser) =>
      browser.createPage("https://example.com", { browserType: "webkit" }),
    );

    expect(webkitLaunchMock).toHaveBeenCalledOnce();
    expect(launchMock).not.toHaveBeenCalled();
    expect(firefoxLaunchMock).not.toHaveBeenCalled();
  });

  it("launches firefox when browserType is firefox", async () => {
    await runBrowser((browser) =>
      browser.createPage("https://example.com", { browserType: "firefox" }),
    );

    expect(firefoxLaunchMock).toHaveBeenCalledOnce();
    expect(launchMock).not.toHaveBeenCalled();
    expect(webkitLaunchMock).not.toHaveBeenCalled();
  });

  it("does not pass chromium-specific args for non-chromium engines", async () => {
    await runBrowser((browser) =>
      browser.createPage("https://example.com", { browserType: "webkit" }),
    );

    expect(webkitLaunchMock).toHaveBeenCalledWith(expect.objectContaining({ args: [] }));
  });
});

describe("Browser.createPage systemChrome", () => {
  const existingPage = { goto: vi.fn().mockResolvedValue(undefined), evaluate: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();

    gotoMock.mockResolvedValue(undefined);
    newPageMock.mockResolvedValue({ goto: gotoMock });
    addCookiesMock.mockResolvedValue(undefined);
    addInitScriptMock.mockResolvedValue(undefined);
    pagesMock.mockReturnValue([existingPage]);
    newContextMock.mockResolvedValue({
      newPage: newPageMock,
      addCookies: addCookiesMock,
      addInitScript: addInitScriptMock,
      pages: pagesMock,
    });
    closeMock.mockResolvedValue(undefined);

    const mockCdpBrowser = {
      contexts: () => [
        {
          newPage: newPageMock,
          addCookies: addCookiesMock,
          addInitScript: addInitScriptMock,
          pages: pagesMock,
        },
      ],
      newContext: newContextMock,
      close: closeMock,
    };
    connectOverCDPMock.mockResolvedValue(mockCdpBrowser);

    defaultBrowserMock.mockReturnValue(Effect.succeed(Option.none()));
    browserListMock.mockReturnValue(Effect.succeed([]));
    killChromeProcessMock.mockReturnValue(Effect.void);
  });

  it("connects to auto-discovered Chrome when systemChrome is true", async () => {
    autoDiscoverCdpMock.mockReturnValue(
      Effect.succeed("ws://127.0.0.1:9222/devtools/browser/abc"),
    );

    const result = await runBrowser((browser) =>
      browser.createPage("https://example.com", { systemChrome: true }),
    );

    expect(autoDiscoverCdpMock).toHaveBeenCalledOnce();
    expect(connectOverCDPMock).toHaveBeenCalledWith(
      "ws://127.0.0.1:9222/devtools/browser/abc",
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(launchSystemChromeMock).not.toHaveBeenCalled();
    expect(launchMock).not.toHaveBeenCalled();
    expect(result.isExternalBrowser).toBe(true);
  });

  it("falls back to launchSystemChrome when discovered CDP fails to connect", async () => {
    autoDiscoverCdpMock.mockReturnValue(
      Effect.succeed("ws://127.0.0.1:9222/devtools/browser/bad"),
    );
    connectOverCDPMock.mockRejectedValueOnce(new Error("Timeout"));
    launchSystemChromeMock.mockReturnValue(
      Effect.succeed({
        process: { kill: vi.fn() },
        wsUrl: "ws://127.0.0.1:55555/devtools/browser/xyz",
        userDataDir: "/tmp/test",
        tempUserDataDir: "/tmp/test",
      }),
    );

    const result = await runBrowser((browser) =>
      browser.createPage("https://example.com", { systemChrome: true }),
    );

    expect(autoDiscoverCdpMock).toHaveBeenCalledOnce();
    expect(launchSystemChromeMock).toHaveBeenCalledOnce();
    expect(result.isExternalBrowser).toBe(false);
  });

  it("falls back to launchSystemChrome when auto-discovery fails", async () => {
    const { CdpDiscoveryError } = await import("../src/errors");
    autoDiscoverCdpMock.mockReturnValue(
      new CdpDiscoveryError({ cause: "No running Chrome found" }).asEffect(),
    );
    launchSystemChromeMock.mockReturnValue(
      Effect.succeed({
        process: { kill: vi.fn() },
        wsUrl: "ws://127.0.0.1:55555/devtools/browser/xyz",
        userDataDir: "/tmp/expect-chrome-test",
        tempUserDataDir: "/tmp/expect-chrome-test",
      }),
    );

    const result = await runBrowser((browser) =>
      browser.createPage("https://example.com", { systemChrome: true }),
    );

    expect(autoDiscoverCdpMock).toHaveBeenCalledOnce();
    expect(launchSystemChromeMock).toHaveBeenCalledOnce();
    expect(connectOverCDPMock).toHaveBeenCalledWith("ws://127.0.0.1:55555/devtools/browser/xyz");
    expect(launchMock).not.toHaveBeenCalled();
    expect(result.isExternalBrowser).toBe(false);
  });

  it("launches system Chrome headed when falling back", async () => {
    const { CdpDiscoveryError } = await import("../src/errors");
    autoDiscoverCdpMock.mockReturnValue(
      new CdpDiscoveryError({ cause: "No running Chrome" }).asEffect(),
    );
    launchSystemChromeMock.mockReturnValue(
      Effect.succeed({
        process: { kill: vi.fn() },
        wsUrl: "ws://127.0.0.1:55555/devtools/browser/xyz",
        userDataDir: "/tmp/test",
        tempUserDataDir: "/tmp/test",
      }),
    );

    await runBrowser((browser) =>
      browser.createPage("https://example.com", { systemChrome: true }),
    );

    expect(launchSystemChromeMock).toHaveBeenCalledWith({ headless: false });
  });

  it("opens a fresh tab for external Chrome instead of reusing existing pages", async () => {
    autoDiscoverCdpMock.mockReturnValue(
      Effect.succeed("ws://127.0.0.1:9222/devtools/browser/abc"),
    );

    await runBrowser((browser) =>
      browser.createPage("https://example.com", { systemChrome: true }),
    );

    expect(newPageMock).toHaveBeenCalledOnce();
  });

  it("skips auto-discovery when cdpUrl is already provided", async () => {
    await runBrowser((browser) =>
      browser.createPage("https://example.com", {
        systemChrome: true,
        cdpUrl: "ws://custom:1234/devtools/browser/manual",
      }),
    );

    expect(autoDiscoverCdpMock).not.toHaveBeenCalled();
    expect(launchSystemChromeMock).not.toHaveBeenCalled();
    expect(connectOverCDPMock).toHaveBeenCalledWith("ws://custom:1234/devtools/browser/manual");
  });

  it("ignores systemChrome when browserType is not chromium", async () => {
    webkitLaunchMock.mockResolvedValue({
      newContext: newContextMock,
      close: closeMock,
    });

    await runBrowser((browser) =>
      browser.createPage("https://example.com", { systemChrome: true, browserType: "webkit" }),
    );

    expect(autoDiscoverCdpMock).not.toHaveBeenCalled();
    expect(launchSystemChromeMock).not.toHaveBeenCalled();
    expect(webkitLaunchMock).toHaveBeenCalledOnce();
  });
});
