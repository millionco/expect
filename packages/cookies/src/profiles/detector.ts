import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import { execCommand } from "@browser-tester/utils";
import type { BrowserInfo, BrowserProfile, LocalStateProfile } from "../types.js";
import { naturalCompare } from "../utils/natural-sort.js";
import { parseProfilesIni } from "../utils/parse-profiles-ini.js";
import { SAFARI_COOKIE_RELATIVE_PATHS } from "../constants.js";
import {
  FIREFOX_EXECUTABLE_DARWIN,
  FIREFOX_LINUX_PATHS,
  FIREFOX_WIN32_PATHS,
  PROFILE_BROWSER_CONFIGS,
  SAFARI_EXECUTABLE,
} from "./constants.js";

const findFirstExisting = (paths: string[]): string | null => paths.find(existsSync) ?? null;

const loadProfileNamesFromLocalState = (userDataDir: string): Record<string, LocalStateProfile> => {
  const localStatePath = path.join(userDataDir, "Local State");
  try {
    const content = readFileSync(localStatePath, "utf-8");
    const localState = JSON.parse(content);
    const infoCache = localState?.profile?.info_cache;
    if (!infoCache || typeof infoCache !== "object") {
      return {};
    }
    const profiles: Record<string, LocalStateProfile> = {};
    for (const [profileId, profileEntry] of Object.entries(infoCache)) {
      const entry = profileEntry as Record<string, unknown>;
      if (entry?.name && typeof entry.name === "string") {
        profiles[profileId] = { name: entry.name };
      }
    }
    return profiles;
  } catch {
    return {};
  }
};

const isValidProfile = (profilePath: string): boolean => {
  try {
    const stats = statSync(profilePath);
    if (!stats.isDirectory()) return false;

    const preferencesPath = path.join(profilePath, "Preferences");
    return existsSync(preferencesPath);
  } catch {
    return false;
  }
};

const getUserDataDirDarwin = (darwinPath: string): string =>
  path.join(homedir(), "Library", "Application Support", darwinPath);

const getUserDataDirLinux = (linuxPath: string): string =>
  path.join(process.env["XDG_CONFIG_HOME"] ?? path.join(homedir(), ".config"), linuxPath);

const getUserDataDirWin32 = (win32Path: string): string => {
  const localAppData = process.env["LOCALAPPDATA"] ?? path.join(homedir(), "AppData", "Local");
  return path.join(localAppData, win32Path);
};

export const getUserDataDir = (
  currentPlatform: string,
  config: {
    darwinUserDataPath: string;
    linuxUserDataPath: string;
    win32UserDataPath: string;
  },
): string | null => {
  switch (currentPlatform) {
    case "darwin":
      return getUserDataDirDarwin(config.darwinUserDataPath);
    case "linux":
      return getUserDataDirLinux(config.linuxUserDataPath);
    case "win32":
      return getUserDataDirWin32(config.win32UserDataPath);
    default:
      return null;
  }
};

const detectProfilesForBrowser = (browser: BrowserInfo, userDataDir: string): BrowserProfile[] => {
  if (!existsSync(userDataDir)) return [];

  const profileNames = loadProfileNamesFromLocalState(userDataDir);
  const profiles: BrowserProfile[] = [];

  try {
    const entries = readdirSync(userDataDir);

    for (const entry of entries) {
      const profilePath = path.join(userDataDir, entry);
      if (!isValidProfile(profilePath)) continue;

      const localStateProfile = profileNames[entry];
      const displayName = localStateProfile?.name ?? entry;

      profiles.push({
        profileName: entry,
        profilePath,
        displayName,
        browser,
      });
    }
  } catch {
    return [];
  }

  profiles.sort((left, right) => naturalCompare(left.profileName, right.profileName));
  return profiles;
};

const detectBrowsersDarwin = (): BrowserInfo[] =>
  PROFILE_BROWSER_CONFIGS.filter((config) => existsSync(config.info.executablePath)).map(
    (config) => config.info,
  );

const detectBrowsersLinux = (): BrowserInfo[] => {
  const browsers: BrowserInfo[] = [];
  for (const config of PROFILE_BROWSER_CONFIGS) {
    const binaryName = config.linuxUserDataPath.split("/").pop() ?? config.linuxUserDataPath;
    const executablePath = findFirstExisting([
      `/usr/bin/${binaryName}`,
      `/usr/local/bin/${binaryName}`,
      `/snap/bin/${binaryName}`,
    ]);
    if (executablePath) {
      browsers.push({ name: config.info.name, executablePath });
    }
  }
  return browsers;
};

const queryRegistryPath = (registryKey: string): string | null => {
  const regPath = `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${registryKey}`;
  return execCommand(`reg query "${regPath}" /ve`);
};

const parseRegistryOutput = (output: string): string | null => {
  const match = output.match(/REG_SZ\s+(.+)/);
  if (!match?.[1]) return null;
  const candidate = match[1].trim();
  return candidate.length > 0 ? candidate : null;
};

const detectBrowsersWin32 = (): BrowserInfo[] => {
  const browsers: BrowserInfo[] = [];
  const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const localAppData = process.env["LOCALAPPDATA"] ?? path.join(homedir(), "AppData", "Local");

  for (const config of PROFILE_BROWSER_CONFIGS) {
    const registryOutput = queryRegistryPath(config.registryKey);
    if (registryOutput) {
      const registryExePath = parseRegistryOutput(registryOutput);
      if (registryExePath && existsSync(registryExePath)) {
        browsers.push({ name: config.info.name, executablePath: registryExePath });
        continue;
      }
    }

    const candidates = config.win32ExecutablePaths.flatMap((relativePath) => [
      path.join(programFiles, relativePath),
      path.join(programFilesX86, relativePath),
      path.join(localAppData, relativePath),
    ]);
    const executablePath = findFirstExisting(candidates);
    if (executablePath) {
      browsers.push({ name: config.info.name, executablePath });
    }
  }
  return browsers;
};

const getFirefoxDataDir = (currentPlatform: string): string | null => {
  const home = homedir();
  switch (currentPlatform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "Firefox");
    case "linux":
      return path.join(home, ".mozilla", "firefox");
    case "win32":
      return path.join(home, "AppData", "Roaming", "Mozilla", "Firefox");
    default:
      return null;
  }
};

const detectFirefoxExecutable = (currentPlatform: string): string | null => {
  if (currentPlatform === "darwin") {
    return existsSync(FIREFOX_EXECUTABLE_DARWIN) ? FIREFOX_EXECUTABLE_DARWIN : null;
  }

  if (currentPlatform === "linux") {
    return findFirstExisting(FIREFOX_LINUX_PATHS);
  }

  if (currentPlatform === "win32") {
    const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const candidates = FIREFOX_WIN32_PATHS.flatMap((relativePath) => [
      path.join(programFiles, relativePath),
      path.join(programFilesX86, relativePath),
    ]);
    return findFirstExisting(candidates);
  }

  return null;
};

const detectFirefoxProfiles = (currentPlatform: string): BrowserProfile[] => {
  const executablePath = detectFirefoxExecutable(currentPlatform);
  if (!executablePath) return [];

  const dataDir = getFirefoxDataDir(currentPlatform);
  if (!dataDir) return [];

  const iniPath = path.join(dataDir, "profiles.ini");
  if (!existsSync(iniPath)) return [];

  let iniContent: string;
  try {
    iniContent = readFileSync(iniPath, "utf-8");
  } catch {
    return [];
  }

  const parsedProfiles = parseProfilesIni(iniContent);
  const browser: BrowserInfo = { name: "Firefox", executablePath };
  const profiles: BrowserProfile[] = [];

  for (const parsed of parsedProfiles) {
    const profilePath = parsed.isRelative ? path.join(dataDir, parsed.path) : parsed.path;

    const cookiesPath = path.join(profilePath, "cookies.sqlite");
    if (!existsSync(cookiesPath)) continue;

    profiles.push({
      profileName: path.basename(profilePath),
      profilePath,
      displayName: parsed.name,
      browser,
    });
  }

  return profiles;
};

const detectSafariProfiles = (currentPlatform: string): BrowserProfile[] => {
  if (currentPlatform !== "darwin") return [];
  if (!existsSync(SAFARI_EXECUTABLE)) return [];

  const home = homedir();
  const browser: BrowserInfo = { name: "Safari", executablePath: SAFARI_EXECUTABLE };

  for (const relativePath of SAFARI_COOKIE_RELATIVE_PATHS) {
    const cookieDir = path.join(home, relativePath);
    const cookieFile = path.join(cookieDir, "Cookies.binarycookies");
    if (existsSync(cookieFile)) {
      return [
        {
          profileName: "Default",
          profilePath: cookieDir,
          displayName: "Default",
          browser,
        },
      ];
    }
  }

  return [];
};

export const detectBrowserProfiles = (): BrowserProfile[] => {
  const currentPlatform = platform();
  const allProfiles: BrowserProfile[] = [];

  const installedBrowsers =
    currentPlatform === "darwin"
      ? detectBrowsersDarwin()
      : currentPlatform === "linux"
        ? detectBrowsersLinux()
        : currentPlatform === "win32"
          ? detectBrowsersWin32()
          : [];

  for (const browser of installedBrowsers) {
    const config = PROFILE_BROWSER_CONFIGS.find(
      (browserConfig) => browserConfig.info.name === browser.name,
    );
    if (!config) continue;

    const userDataDir = getUserDataDir(currentPlatform, config);
    if (!userDataDir) continue;

    const profiles = detectProfilesForBrowser(browser, userDataDir);
    allProfiles.push(...profiles);
  }

  allProfiles.push(...detectFirefoxProfiles(currentPlatform));
  allProfiles.push(...detectSafariProfiles(currentPlatform));

  return allProfiles;
};
