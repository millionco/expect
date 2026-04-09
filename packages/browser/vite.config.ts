import * as fs from "node:fs";
import * as path from "node:path";
import { defineConfig } from "vite-plus";

const BROWSER_TEST_TIMEOUT_MS = 60_000;

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/mcp/index.ts", "src/mcp/start.ts", "src/runtime/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    define: {},
  },
  test: {
    testTimeout: BROWSER_TEST_TIMEOUT_MS,
    hookTimeout: BROWSER_TEST_TIMEOUT_MS,
  },
});
