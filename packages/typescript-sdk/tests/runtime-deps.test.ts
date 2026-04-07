import { describe, it } from "vite-plus/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const sdkRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(sdkRoot, "dist");
const packageJson = JSON.parse(fs.readFileSync(path.join(sdkRoot, "package.json"), "utf-8"));

const declaredDeps = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
]);

const extractRuntimeResolvedPackages = (): string[] => {
  const distFiles = fs
    .readdirSync(distDir)
    .filter((file) => file.endsWith(".mjs") && !file.endsWith(".map"));
  const patterns = [/require\.resolve\(["']([^"']+)["']\)/g, /\.resolve\(`([^`$]+)`\)/g];
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

        if (specifier.startsWith(`${packageName}/package.json`)) continue;

        packages.add(packageName);
      }
    }
  }

  return [...packages];
};

describe("runtime dependency safety", () => {
  it("all require.resolve() targets in dist are declared in package.json dependencies", () => {
    const runtimePackages = extractRuntimeResolvedPackages();
    const missing = runtimePackages.filter((pkg) => !declaredDeps.has(pkg));

    if (missing.length > 0) {
      throw new Error(
        `Found require.resolve() calls in dist/ for packages not in dependencies or peerDependencies:\n\n` +
          missing.map((pkg) => `  - ${pkg}`).join("\n") +
          `\n\nAdd them to "dependencies" in packages/typescript-sdk/package.json ` +
          `so consumers with strict node_modules (pnpm) can resolve them.`,
      );
    }
  });
});
