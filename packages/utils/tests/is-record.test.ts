import { describe, expect, it } from "vite-plus/test";
import { isRecord } from "../src/is-record";

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ key: "value" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
    expect(isRecord(["a", "b"])).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(0n)).toBe(false);
    expect(isRecord(Symbol("test"))).toBe(false);
  });

  it("returns true for class instances", () => {
    expect(isRecord(new Date())).toBe(true);
    expect(isRecord(new Map())).toBe(true);
    expect(isRecord(new Error("test"))).toBe(true);
  });

  it("returns true for Object.create(null)", () => {
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it("returns true for JSON.parse output objects", () => {
    expect(isRecord(JSON.parse('{"key": "value"}'))).toBe(true);
  });

  it("returns false for JSON.parse output arrays", () => {
    expect(isRecord(JSON.parse("[1, 2, 3]"))).toBe(false);
  });
});
