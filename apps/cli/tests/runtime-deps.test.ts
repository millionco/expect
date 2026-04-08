import { describe, it } from "vite-plus/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(cliRoot, "dist");
const packageJson = JSON.parse(fs.readFileSync(path.join(cliRoot, "package.json"), "utf-8"));

const declaredDeps = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {}),
]);

/**
 * Extracts packages that are resolved at runtime from the bundled dist.
 *
 * The bundler (vp pack) inlines source but leaves dynamic require.resolve()
 * and resolvePackageBin() calls intact. These need to be resolvable from
 * the consumer's node_modules, so they must be declared in package.json.
 *
 * Patterns matched:
 *   - .resolve(`@scope/pkg/path`)       — minified makeRequire().resolve()
 *   - .resolve("pkg/path")              — unminified require.resolve()
 *   - resolvePackageBin(`@scope/pkg`)   — minified as varName(`@scope/pkg`)
 *     detected via try/catch context: try:()=>{let t=Fn(`pkg`)
 */
const extractRuntimeResolvedPackages = (): string[] => {
  const distFiles = fs
    .readdirSync(distDir)
    .filter((file) => file.endsWith(".js") && !file.endsWith(".map"));
  const patterns = [
    /\.resolve\(["']([^"']+)["']\)/g,
    /\.resolve\(`([^`$]+)`\)/g,
    // resolvePackageBin gets minified to a short var called inside try blocks
    /try:\(\)=>\{let \w+=\w+\(`([^`]+)`\)/g,
  ];
  const packages = new Set<string>();

  for (const file of distFiles) {
    const content = fs.readFileSync(path.join(distDir, file), "utf-8");
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const specifier = match[1];
        const parts = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2)
          : specifier.split("/").slice(0, 1);
        const packageName = parts.join("/");

        if (packageName === "") continue;
        if (specifier.startsWith(`${packageName}/package.json`)) continue;

        packages.add(packageName);
      }
    }
  }

  return [...packages];
};

describe("runtime dependency safety", () => {
  it("all runtime-resolved packages in dist are declared in package.json dependencies", () => {
    const runtimePackages = extractRuntimeResolvedPackages();
    const missing = runtimePackages.filter((pkg) => !declaredDeps.has(pkg));

    if (missing.length > 0) {
      throw new Error(
        `Found runtime-resolved packages in dist/ not in dependencies, peerDependencies, or optionalDependencies:\n\n` +
          missing.map((pkg) => `  - ${pkg}`).join("\n") +
          `\n\nAdd them to "dependencies" in apps/cli/package.json ` +
          `so consumers with strict node_modules (pnpm) can resolve them.`,
      );
    }
  });
});
