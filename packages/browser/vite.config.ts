import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const BROWSER_TEST_TIMEOUT_MS = 30_000;

const collectMdFiles = (
  baseDir: string,
  dir: string,
  prefix: string = "",
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(join(baseDir, dir))) {
    const fullPath = join(baseDir, dir, entry);
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(fullPath).isDirectory()) {
      Object.assign(result, collectMdFiles(baseDir, join(dir, entry), relPath));
    } else if (entry.endsWith(".md") && !entry.startsWith("_")) {
      const parts = relPath.split("/");
      const isRule = relPath.endsWith("/rule.md") || relPath === "rule.md";
      const parentDir = parts.length >= 2 ? parts[parts.length - 2] : "";
      const isSubRule = parentDir === "rules" || parentDir === "references";
      if (isRule || isSubRule) {
        result[relPath] = readFileSync(fullPath, "utf-8");
      }
    }
  }
  return result;
};

const buildRulesContent = (): string => {
  const configDir = fileURLToPath(new URL(".", import.meta.url));
  const resourcesDir = join(configDir, "src", "mcp", "resources");
  return JSON.stringify(collectMdFiles(resourcesDir, "."));
};

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
