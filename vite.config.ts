import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*.{js,ts,tsx}": "vp check --fix",
  },
  lint: {
    ignorePatterns: ["archive", ".next", "dist"],
    plugins: ["typescript", "react", "import"],
    rules: {
      "require-yield": "off",
    },
    overrides: [
      {
        files: ["packages/**/*.{ts,tsx}"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "react",
                  importNames: ["useEffect"],
                  message:
                    "useEffect is banned. Use derived state, event handlers, data-fetching libraries, or useMountEffect. See .agents/skills/react-best-practices/rules/no-use-effect.md",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  fmt: {
    semi: true,
    singleQuote: false,
    ignorePatterns: ["archive", ".next", "dist"],
  },
});
