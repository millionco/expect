import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    plugins: ["typescript", "react", "import"],
    rules: {
      "require-yield": "off",
    },
  },
});
