import { defineConfig } from "vite-plus";
import { buildRulesContent } from "./scripts/build-rules-content.js";

const BROWSER_TEST_TIMEOUT_MS = 30_000;

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/mcp/index.ts", "src/mcp/start.ts", "src/runtime/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    define: {
      __RULES_CONTENT__: buildRulesContent(),
    },
  },
  test: {
    testTimeout: BROWSER_TEST_TIMEOUT_MS,
  },
});
