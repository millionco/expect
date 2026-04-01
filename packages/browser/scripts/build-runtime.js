import { context } from "esbuild";
import * as fs from "node:fs";

const watchMode = process.argv.includes("--watch");

const RUNTIME_ENTRY = "src/runtime/index.ts";

const extractExportedFunctionNames = (source) => {
  const names = [];

  const constRegex = /export\s+const\s+(\w+)\s*=/g;
  let match;
  while ((match = constRegex.exec(source)) !== null) {
    names.push(match[1]);
  }

  const reExportRegex = /export\s*\{([^}]+)\}/g;
  while ((match = reExportRegex.exec(source)) !== null) {
    for (const token of match[1].split(",")) {
      const trimmed = token.trim();
      if (!trimmed || trimmed.startsWith("type ")) continue;
      names.push(trimmed);
    }
  }

  return names;
};

const generateRuntimeTypes = (exportNames) => {
  const fields = exportNames.map((name) => `  ${name}: typeof Runtime.${name};`).join("\n");
  return [
    `import type * as Runtime from "../runtime/index";`,
    ``,
    `export interface ExpectRuntime {`,
    fields,
    `}`,
    ``,
  ].join("\n");
};

const emitPlugin = {
  name: "emit-runtime-script",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      const runtimeCode =
        `${result.outputFiles[0].text}\n` + "globalThis.__EXPECT_RUNTIME__ = __EXPECT_RUNTIME__;\n";
      fs.mkdirSync("src/generated", { recursive: true });
      fs.writeFileSync(
        "src/generated/runtime-script.ts",
        `export const RUNTIME_SCRIPT = ${JSON.stringify(runtimeCode)};\n`,
      );

      const source = fs.readFileSync(RUNTIME_ENTRY, "utf-8");
      const exportNames = extractExportedFunctionNames(source);
      fs.writeFileSync("src/generated/runtime-types.ts", generateRuntimeTypes(exportNames));
    });
  },
};

const ctx = await context({
  entryPoints: ["src/runtime/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "__EXPECT_RUNTIME__",
  write: false,
  minify: true,
  target: "es2020",
  plugins: [emitPlugin],
});

if (watchMode) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
