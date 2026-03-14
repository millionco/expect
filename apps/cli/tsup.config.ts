import { defineConfig } from "tsup";
import { reactCompilerPlugin } from "./esbuild-react-compiler-plugin";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/^@browser-tester\//],
  esbuildPlugins: [reactCompilerPlugin()],
});
