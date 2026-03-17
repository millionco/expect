import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { copyDir } from "../src/copy-dir";

describe("copyDir", () => {
  let sourceDir: string;
  let destinationDir: string;

  beforeEach(() => {
    sourceDir = mkdtempSync(path.join(tmpdir(), "copy-dir-src-"));
    destinationDir = path.join(mkdtempSync(path.join(tmpdir(), "copy-dir-dst-")), "output");
  });

  afterEach(() => {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(path.dirname(destinationDir), { recursive: true, force: true });
  });

  it("copies a flat directory of files", () => {
    writeFileSync(path.join(sourceDir, "a.txt"), "hello");
    writeFileSync(path.join(sourceDir, "b.txt"), "world");

    copyDir(sourceDir, destinationDir);

    expect(readFileSync(path.join(destinationDir, "a.txt"), "utf-8")).toBe("hello");
    expect(readFileSync(path.join(destinationDir, "b.txt"), "utf-8")).toBe("world");
  });

  it("copies nested directories recursively", () => {
    const nested = path.join(sourceDir, "sub", "deep");
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(nested, "file.txt"), "nested content");

    copyDir(sourceDir, destinationDir);

    expect(readFileSync(path.join(destinationDir, "sub", "deep", "file.txt"), "utf-8")).toBe(
      "nested content",
    );
  });

  it("creates the destination directory if it does not exist", () => {
    writeFileSync(path.join(sourceDir, "test.txt"), "data");

    expect(existsSync(destinationDir)).toBe(false);
    copyDir(sourceDir, destinationDir);
    expect(existsSync(destinationDir)).toBe(true);
  });

  it("handles an empty source directory", () => {
    copyDir(sourceDir, destinationDir);

    expect(existsSync(destinationDir)).toBe(true);
  });
});
