import { describe, expect, it } from "vitest";
import { parseFirefoxExpiry } from "../src/utils/parse-firefox-expiry.js";

describe("parseFirefoxExpiry", () => {
  it("returns rounded seconds for valid numbers", () => {
    expect(parseFirefoxExpiry(1700000000)).toBe(1700000000);
    expect(parseFirefoxExpiry(1700000000.7)).toBe(1700000001);
  });

  it("returns undefined for zero", () => {
    expect(parseFirefoxExpiry(0)).toBeUndefined();
  });

  it("returns undefined for negative numbers", () => {
    expect(parseFirefoxExpiry(-1)).toBeUndefined();
    expect(parseFirefoxExpiry(-1000)).toBeUndefined();
  });

  it("returns undefined for NaN", () => {
    expect(parseFirefoxExpiry(NaN)).toBeUndefined();
  });

  it("handles bigint values", () => {
    expect(parseFirefoxExpiry(1700000000n)).toBe(1700000000);
  });

  it("returns undefined for zero bigint", () => {
    expect(parseFirefoxExpiry(0n)).toBeUndefined();
  });

  it("returns undefined for negative bigint", () => {
    expect(parseFirefoxExpiry(-100n)).toBeUndefined();
  });

  it("parses valid string numbers", () => {
    expect(parseFirefoxExpiry("1700000000")).toBe(1700000000);
  });

  it("returns undefined for non-numeric strings", () => {
    expect(parseFirefoxExpiry("not-a-number")).toBeUndefined();
    expect(parseFirefoxExpiry("")).toBeUndefined();
    expect(parseFirefoxExpiry("Infinity")).toBeUndefined();
  });

  it("returns undefined for values exceeding MAX_UNIX_EPOCH_SECONDS", () => {
    expect(parseFirefoxExpiry(253_402_300_800)).toBeUndefined();
    expect(parseFirefoxExpiry(999_999_999_999)).toBeUndefined();
  });

  it("accepts values at the MAX_UNIX_EPOCH_SECONDS boundary", () => {
    expect(parseFirefoxExpiry(253_402_300_799)).toBe(253_402_300_799);
  });

  it("returns undefined for null and undefined", () => {
    expect(parseFirefoxExpiry(null)).toBeUndefined();
    expect(parseFirefoxExpiry(undefined)).toBeUndefined();
  });

  it("returns undefined for boolean", () => {
    expect(parseFirefoxExpiry(true)).toBeUndefined();
    expect(parseFirefoxExpiry(false)).toBeUndefined();
  });

  it("returns undefined for objects", () => {
    expect(parseFirefoxExpiry({})).toBeUndefined();
    expect(parseFirefoxExpiry([])).toBeUndefined();
  });
});
