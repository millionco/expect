import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { printToolResult, stripUndefined, type ToolResult } from "../src/utils/browser-client";
import { TMP_ARTIFACT_OUTPUT_DIRECTORY } from "@expect/browser/mcp";

const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
      writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
      readFileSync: actual.readFileSync,
      existsSync: actual.existsSync,
      unlinkSync: actual.unlinkSync,
    },
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  };
});

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

describe("browser-client", () => {
  describe("stripUndefined", () => {
    it("removes keys with undefined values", () => {
      expect(stripUndefined({ headed: true, cookies: undefined, url: "http://localhost" })).toEqual(
        {
          headed: true,
          url: "http://localhost",
        },
      );
    });

    it("returns an empty object when all values are undefined", () => {
      expect(stripUndefined({ a: undefined, b: undefined })).toEqual({});
    });

    it("preserves falsy non-undefined values", () => {
      expect(stripUndefined({ zero: 0, empty: "", flag: false })).toEqual({
        zero: 0,
        empty: "",
        flag: false,
      });
    });

    it("returns an empty object for empty input", () => {
      expect(stripUndefined({})).toEqual({});
    });

    it("passes through nested objects without recursion", () => {
      const nested = { inner: { a: 1 } };
      expect(stripUndefined(nested)).toEqual({ inner: { a: 1 } });
    });
  });

  describe("printToolResult", () => {
    let writtenOutput: string;

    beforeEach(() => {
      writtenOutput = "";
      vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
        writtenOutput += String(chunk);
        return true;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      mockMkdirSync.mockClear();
      mockWriteFileSync.mockClear();
    });

    it("prints text content blocks to stdout", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Browser opened." }],
      };
      printToolResult(result);
      expect(writtenOutput).toBe("Browser opened.\n");
    });

    it("prints multiple text blocks", () => {
      const result: ToolResult = {
        content: [
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
        ],
      };
      printToolResult(result);
      expect(writtenOutput).toBe("Line 1\nLine 2\n");
    });

    it("saves image blocks to disk and prints the path", () => {
      const base64Png = Buffer.from("fake-png-data").toString("base64");
      const result: ToolResult = {
        content: [{ type: "image", data: base64Png, mimeType: "image/png" }],
      };
      printToolResult(result);

      expect(mockMkdirSync).toHaveBeenCalledWith(TMP_ARTIFACT_OUTPUT_DIRECTORY, {
        recursive: true,
      });
      expect(mockWriteFileSync).toHaveBeenCalledOnce();
      const savedPath = mockWriteFileSync.mock.calls[0][0] as string;
      expect(savedPath).toContain(TMP_ARTIFACT_OUTPUT_DIRECTORY);
      expect(savedPath).toMatch(/screenshot-\d+\.png$/);
      expect(writtenOutput).toContain("Screenshot saved:");
    });

    it("skips text blocks without text content", () => {
      const result: ToolResult = {
        content: [{ type: "text" }, { type: "text", text: "valid" }],
      };
      printToolResult(result);
      expect(writtenOutput).toBe("valid\n");
    });

    it("handles empty content array", () => {
      const result: ToolResult = { content: [] };
      printToolResult(result);
      expect(writtenOutput).toBe("");
    });

    it("ignores unknown content types", () => {
      const result: ToolResult = {
        content: [{ type: "resource" }, { type: "text", text: "ok" }],
      };
      printToolResult(result);
      expect(writtenOutput).toBe("ok\n");
    });
  });
});
