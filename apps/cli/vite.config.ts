import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Plugin } from "rolldown";
import { defineConfig } from "vite-plus";
import { reactCompilerPlugin } from "./react-compiler-plugin";

const require = createRequire(import.meta.url);
const pkg = require("./package.json");

interface ExportEntry {
  default?: string;
  import?: string;
}

const resolveExportFile = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry;
  const exportEntry = entry as ExportEntry;
  return exportEntry.default ?? exportEntry.import;
};

const findPackageDir = (packageName: string): string | undefined => {
  const searchPaths = require.resolve.paths(packageName);
  if (!searchPaths) return undefined;

  for (const searchPath of searchPaths) {
    const candidate = path.join(searchPath, packageName);
    try {
      fs.realpathSync(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
};

const distToSource = (distPath: string): string =>
  distPath
    .replace(/dist\//, "src/")
    .replace(/\.mjs$/, ".ts")
    .replace(/\.d\.mts$/, ".ts");

const buildExpectSubpathMap = (): Record<string, string> => {
  const map: Record<string, string> = {};
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  for (const packageName of Object.keys(allDeps)) {
    if (!packageName.startsWith("@expect/")) continue;

    const packageDir = findPackageDir(packageName);
    if (!packageDir) continue;

    const packageJsonPath = path.join(packageDir, "package.json");
    const packageJson: { exports?: Record<string, unknown> } = JSON.parse(
      fs.readFileSync(fs.realpathSync(packageJsonPath), "utf8"),
    );
    if (!packageJson.exports) continue;

    for (const subpath of Object.keys(packageJson.exports)) {
      if (subpath === ".") continue;

      const specifier = `${packageName}/${subpath.slice(2)}`;
      const file = resolveExportFile(packageJson.exports[subpath]);
      if (file) {
        map[specifier] = path.join(fs.realpathSync(packageDir), distToSource(file));
      }
    }
  }

  return map;
};

const collectMdFiles = (
  baseDir: string,
  dir: string,
  prefix: string = "",
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(baseDir, dir))) {
    const fullPath = path.join(baseDir, dir, entry);
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    if (fs.statSync(fullPath).isDirectory()) {
      Object.assign(result, collectMdFiles(baseDir, path.join(dir, entry), relPath));
    } else if (entry.endsWith(".md") && !entry.startsWith("_")) {
      const parts = relPath.split("/");
      const isRule = relPath.endsWith("/rule.md") || relPath === "rule.md";
      const parentDir = parts.length >= 2 ? parts[parts.length - 2] : "";
      const isSubRule = parentDir === "rules" || parentDir === "references";
      if (isRule || isSubRule) {
        result[relPath] = fs.readFileSync(fullPath, "utf-8");
      }
    }
  }
  return result;
};

const buildRulesContent = (): string => {
  const resourcesDir = path.join(process.cwd(), "..", "..", "packages", "browser", "src", "mcp", "resources");
  return JSON.stringify(collectMdFiles(resourcesDir, "."));
};

const expectSubpathPlugin = (): Plugin => {
  const subpathMap = buildExpectSubpathMap();
  return {
    name: "expect-subpath-resolve",
    resolveId(source) {
      if (subpathMap[source]) return subpathMap[source];
    },
  };
};

export default defineConfig({
  pack: {
    entry: ["src/index.tsx", "src/browser-mcp.ts", "src/browser-daemon.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    platform: "node",
    fixedExtension: false,
    banner: "#!/usr/bin/env node",
    define: {
      __VERSION__: JSON.stringify(pkg.version),
      __RULES_CONTENT__: buildRulesContent(),
    },
    deps: {
      alwaysBundle: [/^@expect\//],
      neverBundle: [
        "playwright",
        "@agentclientprotocol/claude-agent-acp",
        "@zed-industries/codex-acp",
        "oxc-resolver",
      ],
    },
    minify: true,
    plugins: [expectSubpathPlugin(), reactCompilerPlugin()],
  },
});
