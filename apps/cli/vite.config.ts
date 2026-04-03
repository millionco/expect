import { createRequire } from "node:module";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "rolldown";
import { defineConfig } from "vite-plus";
import { reactCompilerPlugin } from "./react-compiler-plugin";

const isRelevantMdFile = (relPath: string): boolean => {
  if (relPath.endsWith("/SKILL.md") || relPath === "SKILL.md") return true;
  const parts = relPath.split("/");
  if (parts.length >= 2) {
    const parentDir = parts[parts.length - 2];
    if (parentDir === "rules" || parentDir === "references") return true;
  }
  return false;
};

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
    } else if (entry.endsWith(".md") && !entry.startsWith("_") && isRelevantMdFile(relPath)) {
      result[relPath] = readFileSync(fullPath, "utf-8");
    }
  }
  return result;
};

const buildRulesContent = (): string => {
  const configDir = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = join(configDir, "..", "..");
  const expectSkillDir = join(repoRoot, "packages", "expect-skill");
  const agentSkillsDir = join(repoRoot, ".agents", "skills");
  const content: Record<string, string> = {};

  const expectFiles = collectMdFiles(expectSkillDir, ".");
  for (const [key, value] of Object.entries(expectFiles)) {
    content[`expect-skill/${key}`] = value;
  }

  const agentFiles = collectMdFiles(agentSkillsDir, ".");
  for (const [key, value] of Object.entries(agentFiles)) {
    content[`agents/${key}`] = value;
  }

  return JSON.stringify(content);
};

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
    const candidate = join(searchPath, packageName);
    try {
      realpathSync(candidate);
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

    const packageJsonPath = join(packageDir, "package.json");
    const packageJson: { exports?: Record<string, unknown> } = JSON.parse(
      readFileSync(realpathSync(packageJsonPath), "utf8"),
    );
    if (!packageJson.exports) continue;

    for (const subpath of Object.keys(packageJson.exports)) {
      if (subpath === ".") continue;

      const specifier = `${packageName}/${subpath.slice(2)}`;
      const file = resolveExportFile(packageJson.exports[subpath]);
      if (file) {
        map[specifier] = join(realpathSync(packageDir), distToSource(file));
      }
    }
  }

  return map;
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
    entry: ["src/index.tsx", "src/browser-mcp.ts"],
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
