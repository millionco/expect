import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  GLOBAL_INSTALL_COMMANDS,
  GLOBAL_INSTALL_TIMEOUT_MS,
  NPM_PACKAGE_NAME,
  UPDATE_CHECK_STALE_MS,
  UPDATE_CHECK_TIMEOUT_MS,
  VERSION,
  VERSION_API_URL,
  type PackageManager,
} from "../constants";
import { isNewerVersion } from "./is-newer-version";

interface UpdateState {
  lastCheckedAt: number;
  latestVersion: string;
}

const STATE_DIR = join(homedir(), ".expect");
const STATE_PATH = join(STATE_DIR, "update-state.json");

const readUpdateState = (): UpdateState | undefined => {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as UpdateState;
  } catch {
    return undefined;
  }
};

const writeUpdateState = (state: UpdateState) => {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state), "utf-8");
  } catch {
    // HACK: best-effort — if ~/.expect is not writable, skip silently
  }
};

const fetchLatestVersion = async (): Promise<string | undefined> => {
  try {
    const response = await fetch(`${VERSION_API_URL}?source=auto-update&t=${Date.now()}`, {
      signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
    });
    return (await response.text()).trim();
  } catch {
    return undefined;
  }
};

export const detectGlobalPackageManager = (): PackageManager => {
  const binaryPath = process.argv[1] ?? "";
  if (binaryPath.includes("/pnpm/") || binaryPath.includes("/.pnpm")) return "pnpm";
  if (binaryPath.includes("/.bun/")) return "bun";
  if (binaryPath.includes("/.deno/")) return "deno";
  if (binaryPath.includes("/vp/")) return "vp";
  return "npm";
};

export const tryAutoUpdate = async () => {
  if (process.env.EXPECT_NO_AUTO_UPDATE) return;
  if (VERSION === "dev") return;

  const now = Date.now();
  const state = readUpdateState();
  if (state && now - state.lastCheckedAt < UPDATE_CHECK_STALE_MS) return;

  const latestVersion = await fetchLatestVersion();
  if (!latestVersion) {
    writeUpdateState({ lastCheckedAt: now, latestVersion: VERSION });
    return;
  }

  writeUpdateState({ lastCheckedAt: now, latestVersion });

  if (!isNewerVersion(latestVersion, VERSION)) return;

  const packageManager = detectGlobalPackageManager();
  const { binary, args } = GLOBAL_INSTALL_COMMANDS[packageManager];

  console.log(`Updating ${NPM_PACKAGE_NAME} to v${latestVersion}...`);

  const installResult = spawnSync(binary, [...args], {
    stdio: "inherit",
    timeout: GLOBAL_INSTALL_TIMEOUT_MS,
  });

  if (installResult.status !== 0) {
    console.log(`Auto-update failed. Continuing with v${VERSION}.`);
    return;
  }

  console.log(`Updated to v${latestVersion}. Restarting...`);

  const reexec = spawnSync(process.argv[0], process.argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, EXPECT_NO_AUTO_UPDATE: "1" },
  });
  process.exit(reexec.status ?? 1);
};
