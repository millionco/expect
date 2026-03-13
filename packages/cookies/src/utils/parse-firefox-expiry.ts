import { MAX_UNIX_EPOCH_SECONDS } from "../constants.js";

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
