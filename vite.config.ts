import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*.{js,ts,tsx}": "vp check --fix",
  },
  lint: {
    plugins: ["typescript", "react", "import"],
    rules: {
      "require-yield": "off",
    },
  },
  fmt: {
    semi: true,
    singleQuote: false,
  },
});
