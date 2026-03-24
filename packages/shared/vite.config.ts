import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/models.ts", "src/rpcs.ts"],
    codeSplitting: false,
    format: ["esm"],
    dts: true,
    sourcemap: true,
  },
});
