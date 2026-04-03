import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/effect.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
