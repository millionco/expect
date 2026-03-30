import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": resolve(dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
  build: {
    outDir: resolve(dirname(fileURLToPath(import.meta.url)), "../dist/viewer"),
    emptyOutDir: true,
  },
});
