import { MS_PER_SECOND } from "@browser-tester/utils";
import {
  CHROME_EPOCH_MICROSECONDS,
  CHROME_EPOCH_OFFSET_SECONDS,
  CHROME_EPOCH_THRESHOLD,
  MAX_UNIX_EPOCH_SECONDS,
  MILLISECOND_THRESHOLD,
} from "../constants.js";

const clamp = (value: number): number | undefined =>
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
      return clamp(
        Number(expires / BigInt(CHROME_EPOCH_MICROSECONDS) - BigInt(CHROME_EPOCH_OFFSET_SECONDS)),
      );
    }
    if (expires > BigInt(MILLISECOND_THRESHOLD))
      return clamp(Number(expires / BigInt(MS_PER_SECOND)));
    return clamp(Number(expires));
  }

  if (!expires || Number.isNaN(expires)) return undefined;
  if (expires <= 0) return undefined;

  if (expires > CHROME_EPOCH_THRESHOLD) {
    return clamp(expires / CHROME_EPOCH_MICROSECONDS - CHROME_EPOCH_OFFSET_SECONDS);
  }
  if (expires > MILLISECOND_THRESHOLD) return clamp(expires / MS_PER_SECOND);
  return clamp(expires);
};
