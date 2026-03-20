import * as child_process from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { GIT_FINGERPRINT_TIMEOUT_MS, TESTED_FINGERPRINT_FILE, TESTIE_STATE_DIR } from "./constants";

const NULL_SEPARATOR = "\0";

const execGitQuiet = (command: string): string => {
  try {
    return child_process
      .execSync(command, {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: "pipe",
        timeout: GIT_FINGERPRINT_TIMEOUT_MS,
      })
      .trim();
  } catch {
    return "";
  }
};

const getGitRoot = (): string | null => {
  const root = execGitQuiet("git rev-parse --show-toplevel");
  return root || null;
};

const getFingerprintPath = (): string | null => {
  const root = getGitRoot();
  if (!root) return null;
  return path.join(root, TESTIE_STATE_DIR, TESTED_FINGERPRINT_FILE);
};

export const computeTestedFingerprint = (): string | null => {
  const head = execGitQuiet("git rev-parse HEAD");
  if (!head) return null;

  const unstaged = execGitQuiet("git diff");
  const staged = execGitQuiet("git diff --cached");

  return crypto
    .createHash("sha256")
    .update(head)
    .update(NULL_SEPARATOR)
    .update(unstaged)
    .update(NULL_SEPARATOR)
    .update(staged)
    .digest("hex");
};

export const saveTestedFingerprint = (): void => {
  const fingerprint = computeTestedFingerprint();
  const fingerprintPath = getFingerprintPath();
  if (!fingerprint || !fingerprintPath) return;

  const directory = path.dirname(fingerprintPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.writeFileSync(fingerprintPath, fingerprint, "utf-8");
};

export const isCurrentStateTested = (): boolean => {
  const fingerprintPath = getFingerprintPath();
  if (!fingerprintPath || !fs.existsSync(fingerprintPath)) return false;

  const savedFingerprint = fs.readFileSync(fingerprintPath, "utf-8").trim();
  const currentFingerprint = computeTestedFingerprint();
  return savedFingerprint === currentFingerprint;
};
