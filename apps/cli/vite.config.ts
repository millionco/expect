import { defineConfig } from "vite-plus";
import { reactCompilerPlugin } from "./react-compiler-plugin";

export default defineConfig({
  pack: {
    entry: ["src/index.tsx"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    platform: "node",
    fixedExtension: false,
    banner: "#!/usr/bin/env node",
    deps: {
      alwaysBundle: [/^@browser-tester\//],
      neverBundle: ["playwright", "playwright-core", "chromium-bidi", "libsql", "ws", "undici"],
    },
    plugins: [reactCompilerPlugin()],
  },
});
