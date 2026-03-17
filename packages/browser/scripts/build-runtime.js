import { context } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

const watchMode = process.argv.includes("--watch");

const emitPlugin = {
  name: "emit-runtime-script",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      const runtimeCode =
        `${result.outputFiles[0].text}\n` +
        "globalThis.__browserTesterRuntime = __browserTesterRuntime;\n";
      mkdirSync("src/generated", { recursive: true });
      writeFileSync(
        "src/generated/runtime-script.ts",
        `export const RUNTIME_SCRIPT = ${JSON.stringify(runtimeCode)};\n`,
      );
    });
  },
};

const ctx = await context({
  entryPoints: ["src/runtime/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "__browserTesterRuntime",
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
