import { defineConfig } from "tsup";
import { reactCompilerPlugin } from "./esbuild-react-compiler-plugin";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  platform: "node",
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/^@browser-tester\//],
  external: ["playwright", "playwright-core", "chromium-bidi", "sqlite", "ws"],
  esbuildPlugins: [reactCompilerPlugin()],
  esbuildOptions(options) {
    options.inject = [...(options.inject ?? []), "./ink-grab/inject-hook.js"];
  },
});
