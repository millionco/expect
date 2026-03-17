import { describe, expect, it } from "vite-plus/test";
import { getEpochSeconds } from "../src/get-epoch-seconds";

describe("getEpochSeconds", () => {
  it("returns a positive integer", () => {
    const result = getEpochSeconds();
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("returns a value close to Date.now() / 1000", () => {
    const result = getEpochSeconds();
    const expected = Math.floor(Date.now() / 1000);
    expect(Math.abs(result - expected)).toBeLessThanOrEqual(1);
  });

  it("returns a reasonable Unix timestamp (after 2020)", () => {
    const january2020 = 1577836800;
    expect(getEpochSeconds()).toBeGreaterThan(january2020);
  });
});
