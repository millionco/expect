import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/effect.ts"],
    format: ["esm"],
    dts: {
      tsconfig: "../../tsconfig.json",
      resolver: "tsc",
      oxc: false,
      build: true,
    },
    sourcemap: true,
    deps: {
      alwaysBundle: [/@expect\//],
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
