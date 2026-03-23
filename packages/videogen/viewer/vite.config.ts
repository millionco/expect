import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
