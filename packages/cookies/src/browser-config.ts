import type { BrowserKey, ChromiumBrowserKey } from "./types";

interface PlatformPaths {
  readonly darwin: string;
  readonly linux: string;
  readonly win32: string;
}

export interface ChromiumConfig {
  readonly kind: "chromium";
  readonly key: ChromiumBrowserKey;
  readonly displayName: string;
  readonly bundleId: string;
  readonly desktopFiles: readonly string[];
  readonly registryKey: string;
  readonly executable: {
    readonly darwin: string;
    readonly linux: readonly string[];
    readonly win32: readonly string[];
  };
  readonly userData: PlatformPaths;
  readonly cookieRelativePath: PlatformPaths;
  readonly keychainService: string;
  readonly linuxSecretLabel: string;
  readonly localStatePath: string;
}

export interface FirefoxConfig {
  readonly kind: "firefox";
  readonly key: "firefox";
  readonly displayName: string;
  readonly bundleId: string;
  readonly desktopFiles: readonly string[];
  readonly executable: {
    readonly darwin: string;
    readonly linux: readonly string[];
    readonly win32: readonly string[];
  };
  readonly dataDir: PlatformPaths;
}

export interface SafariConfig {
  readonly kind: "safari";
  readonly key: "safari";
  readonly displayName: string;
  readonly bundleId: string;
  readonly executable: string;
  readonly cookieRelativePaths: readonly string[];
}

export type BrowserConfig = ChromiumConfig | FirefoxConfig | SafariConfig;

const chromium = (
  key: ChromiumBrowserKey,
  displayName: string,
  bundleId: string,
  desktopFiles: readonly string[],
  registryKey: string,
  darwinExe: string,
  linuxExe: readonly string[],
  win32Exe: readonly string[],
  userData: PlatformPaths,
  cookieRelativePath: PlatformPaths,
  keychainService: string,
  linuxSecretLabel: string,
  localStatePath: string,
): ChromiumConfig => ({
  kind: "chromium",
  key,
  displayName,
  bundleId,
  desktopFiles,
  registryKey,
  executable: { darwin: darwinExe, linux: linuxExe, win32: win32Exe },
  userData,
  cookieRelativePath,
  keychainService,
  linuxSecretLabel,
  localStatePath,
});

export const CHROMIUM_CONFIGS: readonly ChromiumConfig[] = [
  chromium(
    "chrome",
    "Google Chrome",
    "com.google.chrome",
    ["google-chrome"],
    "chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome", "/snap/bin/google-chrome"],
    ["Google\\Chrome\\Application\\chrome.exe"],
    { darwin: "Google/Chrome", linux: "google-chrome", win32: "Google\\Chrome\\User Data" },
    {
      darwin: "Library/Application Support/Google/Chrome/Default",
      linux: ".config/google-chrome/Default",
      win32: "AppData/Local/Google/Chrome/User Data/Default",
    },
    "Chrome Safe Storage",
    "chrome",
    "AppData/Local/Google/Chrome/User Data/Local State",
  ),
  chromium(
    "brave",
    "Brave Browser",
    "com.brave.browser",
    ["brave-browser"],
    "brave.exe",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ["/usr/bin/brave-browser", "/usr/local/bin/brave-browser", "/snap/bin/brave-browser"],
    ["BraveSoftware\\Brave-Browser\\Application\\brave.exe"],
    {
      darwin: "BraveSoftware/Brave-Browser",
      linux: "BraveSoftware/Brave-Browser",
      win32: "BraveSoftware\\Brave-Browser\\User Data",
    },
    {
      darwin: "Library/Application Support/BraveSoftware/Brave-Browser/Default",
      linux: ".config/BraveSoftware/Brave-Browser/Default",
      win32: "AppData/Local/BraveSoftware/Brave-Browser/User Data/Default",
    },
    "Brave Safe Storage",
    "brave",
    "AppData/Local/BraveSoftware/Brave-Browser/User Data/Local State",
  ),
  chromium(
    "edge",
    "Microsoft Edge",
    "com.microsoft.edgemac",
    ["microsoft-edge"],
    "msedge.exe",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ["/usr/bin/microsoft-edge", "/usr/local/bin/microsoft-edge", "/snap/bin/microsoft-edge"],
    ["Microsoft\\Edge\\Application\\msedge.exe"],
    { darwin: "Microsoft Edge", linux: "microsoft-edge", win32: "Microsoft\\Edge\\User Data" },
    {
      darwin: "Library/Application Support/Microsoft Edge/Default",
      linux: ".config/microsoft-edge/Default",
      win32: "AppData/Local/Microsoft/Edge/User Data/Default",
    },
    "Microsoft Edge Safe Storage",
    "microsoft-edge",
    "AppData/Local/Microsoft/Edge/User Data/Local State",
  ),
  chromium(
    "arc",
    "Arc",
    "company.thebrowser.browser",
    ["arc"],
    "arc.exe",
    "/Applications/Arc.app/Contents/MacOS/Arc",
    ["/usr/bin/arc", "/usr/local/bin/arc", "/snap/bin/arc"],
    ["Arc\\Application\\arc.exe"],
    { darwin: "Arc/User Data", linux: "arc", win32: "Arc\\User Data" },
    {
      darwin: "Library/Application Support/Arc/User Data/Default",
      linux: ".config/arc/Default",
      win32: "AppData/Local/Arc/User Data/Default",
    },
    "Arc Safe Storage",
    "arc",
    "AppData/Local/Arc/User Data/Local State",
  ),
  chromium(
    "dia",
    "Dia",
    "company.thebrowser.dia",
    ["dia"],
    "dia.exe",
    "/Applications/Dia.app/Contents/MacOS/Dia",
    ["/usr/bin/dia", "/usr/local/bin/dia", "/snap/bin/dia"],
    ["Dia\\Application\\dia.exe"],
    { darwin: "Dia/User Data", linux: "dia", win32: "Dia\\User Data" },
    {
      darwin: "Library/Application Support/Dia/User Data/Default",
      linux: ".config/dia/Default",
      win32: "AppData/Local/Dia/User Data/Default",
    },
    "Dia Safe Storage",
    "dia",
    "AppData/Local/Dia/User Data/Local State",
  ),
  chromium(
    "helium",
    "Helium",
    "net.imput.helium",
    ["helium"],
    "helium.exe",
    "/Applications/Helium.app/Contents/MacOS/Helium",
    ["/usr/bin/helium", "/usr/local/bin/helium", "/snap/bin/helium"],
    ["Helium\\Application\\helium.exe"],
    { darwin: "net.imput.helium", linux: "helium", win32: "Helium\\User Data" },
    {
      darwin: "Library/Application Support/net.imput.helium/Default",
      linux: ".config/helium/Default",
      win32: "AppData/Local/Helium/User Data/Default",
    },
    "Helium Storage Key",
    "helium",
    "AppData/Local/Helium/User Data/Local State",
  ),
  chromium(
    "chromium",
    "Chromium",
    "org.chromium.chromium",
    ["chromium", "chromium-browser"],
    "chromium.exe",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ["/usr/bin/chromium", "/usr/local/bin/chromium", "/snap/bin/chromium"],
    ["Chromium\\Application\\chrome.exe"],
    { darwin: "Chromium", linux: "chromium", win32: "Chromium\\User Data" },
    {
      darwin: "Library/Application Support/Chromium/Default",
      linux: ".config/chromium/Default",
      win32: "AppData/Local/Chromium/User Data/Default",
    },
    "Chromium Safe Storage",
    "chromium",
    "AppData/Local/Chromium/User Data/Local State",
  ),
  chromium(
    "vivaldi",
    "Vivaldi",
    "com.vivaldi.vivaldi",
    ["vivaldi", "vivaldi-stable"],
    "vivaldi.exe",
    "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi",
    ["/usr/bin/vivaldi", "/usr/local/bin/vivaldi", "/snap/bin/vivaldi"],
    ["Vivaldi\\Application\\vivaldi.exe"],
    { darwin: "Vivaldi", linux: "vivaldi", win32: "Vivaldi\\User Data" },
    {
      darwin: "Library/Application Support/Vivaldi/Default",
      linux: ".config/vivaldi/Default",
      win32: "AppData/Local/Vivaldi/User Data/Default",
    },
    "Vivaldi Safe Storage",
    "vivaldi",
    "AppData/Local/Vivaldi/User Data/Local State",
  ),
  chromium(
    "opera",
    "Opera",
    "com.operasoftware.opera",
    ["opera", "opera-stable"],
    "opera.exe",
    "/Applications/Opera.app/Contents/MacOS/Opera",
    ["/usr/bin/opera", "/usr/local/bin/opera", "/snap/bin/opera"],
    ["Opera\\launcher.exe"],
    { darwin: "com.operasoftware.Opera", linux: "opera", win32: "Opera Software\\Opera Stable" },
    {
      darwin: "Library/Application Support/com.operasoftware.Opera",
      linux: ".config/opera",
      win32: "AppData/Roaming/Opera Software/Opera Stable",
    },
    "Opera Safe Storage",
    "opera",
    "AppData/Roaming/Opera Software/Opera Stable/Local State",
  ),
  chromium(
    "ghost",
    "Ghost Browser",
    "com.nickvision.ghost",
    ["ghost-browser"],
    "ghost.exe",
    "/Applications/Ghost Browser.app/Contents/MacOS/Ghost Browser",
    ["/usr/bin/ghost-browser", "/usr/local/bin/ghost-browser", "/snap/bin/ghost-browser"],
    ["Ghost Browser\\Application\\ghost.exe"],
    { darwin: "Ghost Browser", linux: "ghost-browser", win32: "Ghost Browser\\User Data" },
    {
      darwin: "Library/Application Support/Ghost Browser/Default",
      linux: ".config/ghost-browser/Default",
      win32: "AppData/Local/Ghost Browser/User Data/Default",
    },
    "Ghost Browser Safe Storage",
    "ghost-browser",
    "AppData/Local/Ghost Browser/User Data/Local State",
  ),
  chromium(
    "sidekick",
    "Sidekick",
    "pushplaylabs.sidekick",
    ["sidekick"],
    "sidekick.exe",
    "/Applications/Sidekick.app/Contents/MacOS/Sidekick",
    ["/usr/bin/sidekick", "/usr/local/bin/sidekick", "/snap/bin/sidekick"],
    ["Sidekick\\Application\\sidekick.exe"],
    { darwin: "Sidekick", linux: "sidekick", win32: "Sidekick\\User Data" },
    {
      darwin: "Library/Application Support/Sidekick/Default",
      linux: ".config/sidekick/Default",
      win32: "AppData/Local/Sidekick/User Data/Default",
    },
    "Sidekick Safe Storage",
    "sidekick",
    "AppData/Local/Sidekick/User Data/Local State",
  ),
  chromium(
    "yandex",
    "Yandex",
    "ru.yandex.desktop.yandex-browser",
    ["yandex-browser"],
    "browser.exe",
    "/Applications/Yandex.app/Contents/MacOS/Yandex",
    ["/usr/bin/yandex-browser", "/usr/local/bin/yandex-browser", "/snap/bin/yandex-browser"],
    ["Yandex\\YandexBrowser\\Application\\browser.exe"],
    { darwin: "YandexBrowser", linux: "yandex-browser", win32: "Yandex\\YandexBrowser\\User Data" },
    {
      darwin: "Library/Application Support/YandexBrowser/Default",
      linux: ".config/yandex-browser/Default",
      win32: "AppData/Local/Yandex/YandexBrowser/User Data/Default",
    },
    "Yandex Safe Storage",
    "yandex-browser",
    "AppData/Local/Yandex/YandexBrowser/User Data/Local State",
  ),
  chromium(
    "iridium",
    "Iridium",
    "de.nickvision.iridium",
    ["iridium"],
    "iridium.exe",
    "/Applications/Iridium.app/Contents/MacOS/Iridium",
    ["/usr/bin/iridium", "/usr/local/bin/iridium", "/snap/bin/iridium"],
    ["Iridium\\Application\\iridium.exe"],
    { darwin: "Iridium", linux: "iridium", win32: "Iridium\\User Data" },
    {
      darwin: "Library/Application Support/Iridium/Default",
      linux: ".config/iridium/Default",
      win32: "AppData/Local/Iridium/User Data/Default",
    },
    "Iridium Safe Storage",
    "iridium",
    "AppData/Local/Iridium/User Data/Local State",
  ),
  chromium(
    "thorium",
    "Thorium",
    "nickvision.thorium",
    ["thorium"],
    "thorium.exe",
    "/Applications/Thorium.app/Contents/MacOS/Thorium",
    ["/usr/bin/thorium", "/usr/local/bin/thorium", "/snap/bin/thorium"],
    ["Thorium\\Application\\thorium.exe"],
    { darwin: "Thorium", linux: "thorium", win32: "Thorium\\User Data" },
    {
      darwin: "Library/Application Support/Thorium/Default",
      linux: ".config/thorium/Default",
      win32: "AppData/Local/Thorium/User Data/Default",
    },
    "Thorium Safe Storage",
    "thorium",
    "AppData/Local/Thorium/User Data/Local State",
  ),
  chromium(
    "sigmaos",
    "SigmaOS",
    "com.nickvision.sigmaos",
    ["sigmaos"],
    "sigmaos.exe",
    "/Applications/SigmaOS.app/Contents/MacOS/SigmaOS",
    ["/usr/bin/sigmaos", "/usr/local/bin/sigmaos", "/snap/bin/sigmaos"],
    ["SigmaOS\\Application\\sigmaos.exe"],
    { darwin: "SigmaOS", linux: "sigmaos", win32: "SigmaOS\\User Data" },
    {
      darwin: "Library/Application Support/SigmaOS/Default",
      linux: ".config/sigmaos/Default",
      win32: "AppData/Local/SigmaOS/User Data/Default",
    },
    "SigmaOS Safe Storage",
    "sigmaos",
    "AppData/Local/SigmaOS/User Data/Local State",
  ),
  chromium(
    "wavebox",
    "Wavebox",
    "io.wavebox.wavebox",
    ["wavebox"],
    "wavebox.exe",
    "/Applications/Wavebox.app/Contents/MacOS/Wavebox",
    ["/usr/bin/wavebox", "/usr/local/bin/wavebox", "/snap/bin/wavebox"],
    ["Wavebox\\Application\\wavebox.exe"],
    { darwin: "Wavebox", linux: "wavebox", win32: "Wavebox\\User Data" },
    {
      darwin: "Library/Application Support/Wavebox/Default",
      linux: ".config/wavebox/Default",
      win32: "AppData/Local/Wavebox/User Data/Default",
    },
    "Wavebox Safe Storage",
    "wavebox",
    "AppData/Local/Wavebox/User Data/Local State",
  ),
  chromium(
    "comet",
    "Comet",
    "com.nickvision.comet",
    ["comet"],
    "comet.exe",
    "/Applications/Comet.app/Contents/MacOS/Comet",
    ["/usr/bin/comet", "/usr/local/bin/comet", "/snap/bin/comet"],
    ["Comet\\Application\\comet.exe"],
    { darwin: "Comet", linux: "comet", win32: "Comet\\User Data" },
    {
      darwin: "Library/Application Support/Comet/Default",
      linux: ".config/comet/Default",
      win32: "AppData/Local/Comet/User Data/Default",
    },
    "Comet Safe Storage",
    "comet",
    "AppData/Local/Comet/User Data/Local State",
  ),
  chromium(
    "blisk",
    "Blisk",
    "com.nickvision.blisk",
    ["blisk"],
    "blisk.exe",
    "/Applications/Blisk.app/Contents/MacOS/Blisk",
    ["/usr/bin/blisk", "/usr/local/bin/blisk", "/snap/bin/blisk"],
    ["Blisk\\Application\\blisk.exe"],
    { darwin: "Blisk", linux: "blisk", win32: "Blisk\\User Data" },
    {
      darwin: "Library/Application Support/Blisk/Default",
      linux: ".config/blisk/Default",
      win32: "AppData/Local/Blisk/User Data/Default",
    },
    "Blisk Safe Storage",
    "blisk",
    "AppData/Local/Blisk/User Data/Local State",
  ),
];

export const FIREFOX_CONFIG: FirefoxConfig = {
  kind: "firefox",
  key: "firefox",
  displayName: "Firefox",
  bundleId: "org.mozilla.firefox",
  desktopFiles: ["firefox"],
  executable: {
    darwin: "/Applications/Firefox.app/Contents/MacOS/firefox",
    linux: ["/usr/bin/firefox", "/usr/local/bin/firefox", "/snap/bin/firefox"],
    win32: ["Mozilla Firefox\\firefox.exe"],
  },
  dataDir: {
    darwin: "Library/Application Support/Firefox",
    linux: ".mozilla/firefox",
    win32: "AppData/Roaming/Mozilla/Firefox",
  },
};

export const SAFARI_CONFIG: SafariConfig = {
  kind: "safari",
  key: "safari",
  displayName: "Safari",
  bundleId: "com.apple.safari",
  executable: "/Applications/Safari.app/Contents/MacOS/Safari",
  cookieRelativePaths: [
    "Library/Cookies",
    "Library/Containers/com.apple.Safari/Data/Library/Cookies",
  ],
};

export const BROWSER_CONFIGS: readonly BrowserConfig[] = [
  ...CHROMIUM_CONFIGS,
  FIREFOX_CONFIG,
  SAFARI_CONFIG,
];

const bundleIdMap = new Map<string, BrowserConfig>();
const desktopFileMap = new Map<string, BrowserConfig>();
const displayNameMap = new Map<string, BrowserConfig>();
const keyMap = new Map<BrowserKey, BrowserConfig>();

for (const config of BROWSER_CONFIGS) {
  keyMap.set(config.key, config);
  bundleIdMap.set(config.bundleId.toLowerCase(), config);
  displayNameMap.set(config.displayName, config);
  if ("desktopFiles" in config) {
    for (const desktopFile of config.desktopFiles) {
      desktopFileMap.set(desktopFile, config);
    }
  }
}

// HACK: Edge has two bundle IDs
bundleIdMap.set("com.microsoft.edge", keyMap.get("edge")!);

export const configByKey = (key: BrowserKey): BrowserConfig | undefined => keyMap.get(key);

export const configByBundleId = (identifier: string): BrowserConfig | undefined =>
  bundleIdMap.get(identifier.toLowerCase());

export const configByDesktopFile = (name: string): BrowserConfig | undefined =>
  desktopFileMap.get(name.replace(/\.desktop$/, ""));

export const chromiumConfig = (key: ChromiumBrowserKey): ChromiumConfig =>
  CHROMIUM_CONFIGS.find((config) => config.key === key)!;
