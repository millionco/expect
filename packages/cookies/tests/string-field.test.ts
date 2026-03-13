import { describe, expect, it } from "vitest";
import { stringField } from "../src/utils/string-field.js";

describe("stringField", () => {
  it("returns strings as-is", () => {
    expect(stringField("hello")).toBe("hello");
    expect(stringField("")).toBe("");
  });

  it("returns null for numbers", () => {
    expect(stringField(0)).toBeNull();
    expect(stringField(42)).toBeNull();
  });

  it("returns null for null and undefined", () => {
    expect(stringField(null)).toBeNull();
    expect(stringField(undefined)).toBeNull();
  });

  it("returns null for booleans", () => {
    expect(stringField(true)).toBeNull();
    expect(stringField(false)).toBeNull();
  });

  it("returns null for objects and arrays", () => {
    expect(stringField({})).toBeNull();
    expect(stringField([])).toBeNull();
  });

  it("returns null for bigints", () => {
    expect(stringField(1n)).toBeNull();
  });
});
