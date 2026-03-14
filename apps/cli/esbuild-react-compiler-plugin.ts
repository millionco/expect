import { readFileSync } from "node:fs";
import * as babel from "@babel/core";
import BabelPluginReactCompiler from "babel-plugin-react-compiler";
import type { Plugin } from "esbuild";

export const reactCompilerPlugin = (filter: RegExp = /\.tsx$/): Plugin => ({
  name: "react-compiler",
  setup(build) {
    build.onLoad({ filter }, (args) => {
      const source = readFileSync(args.path, "utf8");

      const esbuildResult = build.esbuild.transformSync(source, {
        loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
        jsx: "automatic",
        target: build.initialOptions.target,
      });

      const babelResult = babel.transformSync(esbuildResult.code, {
        plugins: [BabelPluginReactCompiler],
        filename: args.path,
        caller: { name: "react-compiler", supportsStaticESM: true },
      });

      return { contents: babelResult?.code ?? esbuildResult.code, loader: "js" };
    });
  },
});
