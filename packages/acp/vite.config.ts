import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    platform: "node",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
