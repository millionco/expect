import { spawnSync } from "node:child_process";
import { type PackageManager, GLOBAL_INSTALL_TIMEOUT_MS, NPM_PACKAGE_NAME } from "../constants";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { spinner } from "../utils/spinner";
import { detectPackageManager, tryRun } from "./init-utils";

export interface InstallCommand {
  binary: string;
  args: readonly string[];
}

const normalizeVersionSpecifier = (version?: string): string => {
  if (version === undefined || version.trim() === "") return "latest";
  const trimmedVersion = version.trim();
  if (/^v\d/.test(trimmedVersion)) return trimmedVersion.slice(1);
  return trimmedVersion;
};

const formatVersionLabel = (version?: string): string => {
  const versionSpecifier = normalizeVersionSpecifier(version);
  return /^\d+\.\d+\.\d+/.test(versionSpecifier) ? `v${versionSpecifier}` : versionSpecifier;
};

const getPackageReference = (packageManager: PackageManager, version?: string): string => {
  const versionSpecifier = normalizeVersionSpecifier(version);
  if (packageManager === "deno") {
    return `npm:${NPM_PACKAGE_NAME}@${versionSpecifier}`;
  }
  return `${NPM_PACKAGE_NAME}@${versionSpecifier}`;
};

export const getGlobalInstallCommand = (
  packageManager: PackageManager,
  version?: string,
): InstallCommand => {
  const packageReference = getPackageReference(packageManager, version);

  switch (packageManager) {
    case "npm":
      return { binary: "npm", args: ["install", "-g", packageReference] };
    case "pnpm":
      return { binary: "pnpm", args: ["add", "-g", packageReference] };
    case "yarn":
      return { binary: "yarn", args: ["global", "add", packageReference] };
    case "bun":
      return { binary: "bun", args: ["add", "-g", packageReference] };
    case "deno":
      return { binary: "deno", args: ["install", "-g", packageReference] };
    case "vp":
      return { binary: "vp", args: ["install", "-g", packageReference] };
  }
};

export const formatInstallCommand = (command: InstallCommand): string =>
  `${command.binary} ${command.args.join(" ")}`;

export const runInstallCommand = (command: InstallCommand): Promise<boolean> =>
  tryRun(command.binary, command.args);

export const runInstallCommandSync = (command: InstallCommand): boolean => {
  const result = spawnSync(command.binary, [...command.args], {
    stdio: "inherit",
    timeout: GLOBAL_INSTALL_TIMEOUT_MS,
  });

  return result.status === 0;
};

export const runUpdateCommand = async (version?: string) => {
  const packageManager = detectPackageManager();
  const installCommand = getGlobalInstallCommand(packageManager, version);
  const versionLabel = formatVersionLabel(version);

  logger.break();
  const updateSpinner = spinner(`Updating expect-cli to ${versionLabel}...`).start();
  const updated = await runInstallCommand(installCommand);

  if (updated) {
    updateSpinner.succeed(`Updated expect-cli to ${versionLabel}.`);
    return;
  }

  updateSpinner.fail(`Failed to update expect-cli to ${versionLabel}.`);
  logger.dim(`  Run manually: ${highlighter.info(formatInstallCommand(installCommand))}`);
  process.exitCode = 1;
};

export const runUpdateCommandSync = (version?: string): boolean => {
  const packageManager = detectPackageManager();
  const installCommand = getGlobalInstallCommand(packageManager, version);
  const versionLabel = formatVersionLabel(version);

  logger.break();
  logger.log(`Updating expect-cli to ${highlighter.info(versionLabel)}...`);
  const updated = runInstallCommandSync(installCommand);

  if (updated) {
    logger.success(`Updated expect-cli to ${versionLabel}.`);
    logger.break();
    return true;
  }

  logger.error(`Failed to update expect-cli to ${versionLabel}.`);
  logger.dim(`  Run manually: ${highlighter.info(formatInstallCommand(installCommand))}`);
  logger.break();
  return false;
};
