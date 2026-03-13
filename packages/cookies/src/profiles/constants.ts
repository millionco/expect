import type { BrowserInfo } from "../types.js";

export const FIREFOX_EXECUTABLE_DARWIN = "/Applications/Firefox.app/Contents/MacOS/firefox";

export const FIREFOX_LINUX_PATHS = [
  "/usr/bin/firefox",
  "/usr/local/bin/firefox",
  "/snap/bin/firefox",
];

export const FIREFOX_WIN32_PATHS = ["Mozilla Firefox\\firefox.exe"];

export const SAFARI_EXECUTABLE = "/Applications/Safari.app/Contents/MacOS/Safari";

export const CDP_RETRY_COUNT = 10;
export const CDP_RETRY_DELAY_MS = 1_000;
export const CDP_LOCAL_PORT = 9222;
export const BROWSER_STARTUP_DELAY_MS = 3_000;
export const BROWSER_KILL_DELAY_MS = 500;
export const TEMP_DIR_CLEANUP_RETRIES = 3;
export const TEMP_DIR_RETRY_DELAY_MS = 200;

export const HEADLESS_CHROME_ARGS = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-address=127.0.0.1",
];

interface ProfileDetectionConfig {
  info: BrowserInfo;
  darwinUserDataPath: string;
  linuxUserDataPath: string;
  win32UserDataPath: string;
  win32ExecutablePaths: string[];
  registryKey: string;
}

export const PROFILE_BROWSER_CONFIGS: ProfileDetectionConfig[] = [
  {
    info: {
      name: "Google Chrome",
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
    darwinUserDataPath: "Google/Chrome",
    linuxUserDataPath: "google-chrome",
    win32UserDataPath: "Google\\Chrome\\User Data",
    win32ExecutablePaths: ["Google\\Chrome\\Application\\chrome.exe"],
    registryKey: "chrome.exe",
  },
  {
    info: {
      name: "Brave Browser",
      executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    },
    darwinUserDataPath: "BraveSoftware/Brave-Browser",
    linuxUserDataPath: "BraveSoftware/Brave-Browser",
    win32UserDataPath: "BraveSoftware\\Brave-Browser\\User Data",
    win32ExecutablePaths: ["BraveSoftware\\Brave-Browser\\Application\\brave.exe"],
    registryKey: "brave.exe",
  },
  {
    info: {
      name: "Microsoft Edge",
      executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    },
    darwinUserDataPath: "Microsoft Edge",
    linuxUserDataPath: "microsoft-edge",
    win32UserDataPath: "Microsoft\\Edge\\User Data",
    win32ExecutablePaths: ["Microsoft\\Edge\\Application\\msedge.exe"],
    registryKey: "msedge.exe",
  },
  {
    info: {
      name: "Chromium",
      executablePath: "/Applications/Chromium.app/Contents/MacOS/Chromium",
    },
    darwinUserDataPath: "Chromium",
    linuxUserDataPath: "chromium",
    win32UserDataPath: "Chromium\\User Data",
    win32ExecutablePaths: ["Chromium\\Application\\chrome.exe"],
    registryKey: "chromium.exe",
  },
  {
    info: { name: "Vivaldi", executablePath: "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi" },
    darwinUserDataPath: "Vivaldi",
    linuxUserDataPath: "vivaldi",
    win32UserDataPath: "Vivaldi\\User Data",
    win32ExecutablePaths: ["Vivaldi\\Application\\vivaldi.exe"],
    registryKey: "vivaldi.exe",
  },
  {
    info: { name: "Opera", executablePath: "/Applications/Opera.app/Contents/MacOS/Opera" },
    darwinUserDataPath: "com.operasoftware.Opera",
    linuxUserDataPath: "opera",
    win32UserDataPath: "Opera Software\\Opera Stable",
    win32ExecutablePaths: ["Opera\\launcher.exe"],
    registryKey: "opera.exe",
  },
  {
    info: { name: "Arc", executablePath: "/Applications/Arc.app/Contents/MacOS/Arc" },
    darwinUserDataPath: "Arc/User Data",
    linuxUserDataPath: "arc",
    win32UserDataPath: "Arc\\User Data",
    win32ExecutablePaths: ["Arc\\Application\\arc.exe"],
    registryKey: "arc.exe",
  },
  {
    info: {
      name: "Ghost Browser",
      executablePath: "/Applications/Ghost Browser.app/Contents/MacOS/Ghost Browser",
    },
    darwinUserDataPath: "Ghost Browser",
    linuxUserDataPath: "ghost-browser",
    win32UserDataPath: "Ghost Browser\\User Data",
    win32ExecutablePaths: ["Ghost Browser\\Application\\ghost.exe"],
    registryKey: "ghost.exe",
  },
  {
    info: {
      name: "Sidekick",
      executablePath: "/Applications/Sidekick.app/Contents/MacOS/Sidekick",
    },
    darwinUserDataPath: "Sidekick",
    linuxUserDataPath: "sidekick",
    win32UserDataPath: "Sidekick\\User Data",
    win32ExecutablePaths: ["Sidekick\\Application\\sidekick.exe"],
    registryKey: "sidekick.exe",
  },
  {
    info: { name: "Yandex", executablePath: "/Applications/Yandex.app/Contents/MacOS/Yandex" },
    darwinUserDataPath: "YandexBrowser",
    linuxUserDataPath: "yandex-browser",
    win32UserDataPath: "Yandex\\YandexBrowser\\User Data",
    win32ExecutablePaths: ["Yandex\\YandexBrowser\\Application\\browser.exe"],
    registryKey: "browser.exe",
  },
  {
    info: { name: "Iridium", executablePath: "/Applications/Iridium.app/Contents/MacOS/Iridium" },
    darwinUserDataPath: "Iridium",
    linuxUserDataPath: "iridium",
    win32UserDataPath: "Iridium\\User Data",
    win32ExecutablePaths: ["Iridium\\Application\\iridium.exe"],
    registryKey: "iridium.exe",
  },
  {
    info: { name: "Thorium", executablePath: "/Applications/Thorium.app/Contents/MacOS/Thorium" },
    darwinUserDataPath: "Thorium",
    linuxUserDataPath: "thorium",
    win32UserDataPath: "Thorium\\User Data",
    win32ExecutablePaths: ["Thorium\\Application\\thorium.exe"],
    registryKey: "thorium.exe",
  },
  {
    info: { name: "SigmaOS", executablePath: "/Applications/SigmaOS.app/Contents/MacOS/SigmaOS" },
    darwinUserDataPath: "SigmaOS",
    linuxUserDataPath: "sigmaos",
    win32UserDataPath: "SigmaOS\\User Data",
    win32ExecutablePaths: ["SigmaOS\\Application\\sigmaos.exe"],
    registryKey: "sigmaos.exe",
  },
  {
    info: { name: "Wavebox", executablePath: "/Applications/Wavebox.app/Contents/MacOS/Wavebox" },
    darwinUserDataPath: "Wavebox",
    linuxUserDataPath: "wavebox",
    win32UserDataPath: "Wavebox\\User Data",
    win32ExecutablePaths: ["Wavebox\\Application\\wavebox.exe"],
    registryKey: "wavebox.exe",
  },
  {
    info: { name: "Comet", executablePath: "/Applications/Comet.app/Contents/MacOS/Comet" },
    darwinUserDataPath: "Comet",
    linuxUserDataPath: "comet",
    win32UserDataPath: "Comet\\User Data",
    win32ExecutablePaths: ["Comet\\Application\\comet.exe"],
    registryKey: "comet.exe",
  },
  {
    info: { name: "Blisk", executablePath: "/Applications/Blisk.app/Contents/MacOS/Blisk" },
    darwinUserDataPath: "Blisk",
    linuxUserDataPath: "blisk",
    win32UserDataPath: "Blisk\\User Data",
    win32ExecutablePaths: ["Blisk\\Application\\blisk.exe"],
    registryKey: "blisk.exe",
  },
  {
    info: { name: "Helium", executablePath: "/Applications/Helium.app/Contents/MacOS/Helium" },
    darwinUserDataPath: "Helium",
    linuxUserDataPath: "helium",
    win32UserDataPath: "Helium\\User Data",
    win32ExecutablePaths: ["Helium\\Application\\helium.exe"],
    registryKey: "helium.exe",
  },
  {
    info: { name: "Dia", executablePath: "/Applications/Dia.app/Contents/MacOS/Dia" },
    darwinUserDataPath: "Dia",
    linuxUserDataPath: "dia",
    win32UserDataPath: "Dia\\User Data",
    win32ExecutablePaths: ["Dia\\Application\\dia.exe"],
    registryKey: "dia.exe",
  },
];
