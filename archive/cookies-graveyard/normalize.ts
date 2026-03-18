/**
 * @deprecated ARCHIVED / DEAD CODE
 * Do not import, pattern-match on, or reference this code in new work.
 * Kept only as reference for browser SQLite decryption and cookie extraction logic.
 */

import type { SameSitePolicy } from "../types";
import { MS_PER_SECOND } from "@browser-tester/utils";

const SAME_SITE_NONE = 0;
const SAME_SITE_LAX = 1;
const SAME_SITE_STRICT = 2;
const MAX_UNIX_EPOCH_SECONDS = 253_402_300_799;
const CHROME_EPOCH_THRESHOLD = 10_000_000_000_000;
const CHROME_EPOCH_MICROSECONDS = 1_000_000;
const CHROME_EPOCH_OFFSET_SECONDS = 11_644_473_600;
const MILLISECOND_THRESHOLD = 10_000_000_000;

const SAME_SITE_BY_NAME: Readonly<Record<string, SameSitePolicy>> = {
  strict: "Strict",
  lax: "Lax",
  none: "None",
  no_restriction: "None",
};

export const normalizeSameSite = (value: unknown): SameSitePolicy | undefined => {
  if (typeof value === "bigint") return normalizeSameSite(Number(value));
  if (typeof value === "number") {
    if (value === SAME_SITE_STRICT) return "Strict";
    if (value === SAME_SITE_LAX) return "Lax";
    if (value === SAME_SITE_NONE) return "None";
    return undefined;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return normalizeSameSite(parsed);
    return SAME_SITE_BY_NAME[value.toLowerCase()];
  }
  return undefined;
};

const clampExpiration = (value: number): number | undefined =>
  value > 0 && value <= MAX_UNIX_EPOCH_SECONDS ? Math.round(value) : undefined;

export const normalizeExpiration = (expires?: number | bigint | string): number | undefined => {
  if (expires === undefined) return undefined;

  if (typeof expires === "string") {
    const parsed = Number(expires);
    if (!Number.isFinite(parsed)) return undefined;
    return normalizeExpiration(parsed);
  }

  if (typeof expires === "bigint") {
    if (expires <= 0n) return undefined;
    if (expires > BigInt(CHROME_EPOCH_THRESHOLD)) {
      return clampExpiration(
        Number(expires / BigInt(CHROME_EPOCH_MICROSECONDS) - BigInt(CHROME_EPOCH_OFFSET_SECONDS)),
      );
    }
    if (expires > BigInt(MILLISECOND_THRESHOLD))
      return clampExpiration(Number(expires / BigInt(MS_PER_SECOND)));
    return clampExpiration(Number(expires));
  }

  if (!expires || Number.isNaN(expires)) return undefined;
  if (expires <= 0) return undefined;

  if (expires > CHROME_EPOCH_THRESHOLD) {
    return clampExpiration(expires / CHROME_EPOCH_MICROSECONDS - CHROME_EPOCH_OFFSET_SECONDS);
  }
  if (expires > MILLISECOND_THRESHOLD) return clampExpiration(expires / MS_PER_SECOND);
  return clampExpiration(expires);
};

export const parseFirefoxExpiry = (value: unknown): number | undefined => {
  let expirySeconds: number;
  if (typeof value === "bigint") {
    expirySeconds = Number(value);
  } else if (typeof value === "string") {
    expirySeconds = Number(value);
    if (!Number.isFinite(expirySeconds)) return undefined;
  } else if (typeof value === "number") {
    expirySeconds = value;
  } else {
    return undefined;
  }
  if (Number.isNaN(expirySeconds) || expirySeconds <= 0 || expirySeconds > MAX_UNIX_EPOCH_SECONDS)
    return undefined;
  return Math.round(expirySeconds);
};
