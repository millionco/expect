import * as babel from "@babel/core";
import BabelPluginReactCompiler from "babel-plugin-react-compiler";

export const reactCompilerPlugin = (filter: RegExp = /\.tsx$/) => ({
  name: "react-compiler",
  transform(code: string, id: string) {
    if (!filter.test(id)) return;

    const result = babel.transformSync(code, {
      plugins: [["@babel/plugin-syntax-typescript", { isTSX: true }], BabelPluginReactCompiler],
      filename: id,
      caller: { name: "react-compiler", supportsStaticESM: true },
    });

    if (!result?.code) return;
    return { code: result.code };
  },
});
