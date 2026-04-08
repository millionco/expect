import * as fs from "node:fs";
import * as path from "node:path";
import * as jsoncParser from "jsonc-parser";
import { ConfigRecord } from "./config-types";
import { deepMerge, getNestedValue, isConfigRecord } from "./config-utils";

const detectIndent = (text: string): { tabSize: number; insertSpaces: boolean } => {
  let indent: { tabSize: number; insertSpaces: boolean } | undefined;

  jsoncParser.visit(text, {
    onObjectProperty: (_property, offset, _length, startLine, startCharacter) => {
      if (indent !== undefined || startLine <= 0 || startCharacter <= 0) return;

      const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
      const whitespace = text.slice(lineStart, offset);
      indent = {
        tabSize: startCharacter,
        insertSpaces: !whitespace.includes("\t"),
      };
    },
  });

  return indent ?? { tabSize: 2, insertSpaces: true };
};

export const readJsonConfig = (configPath: string): ConfigRecord => {
  if (!fs.existsSync(configPath)) return {};

  const content = fs.readFileSync(configPath, "utf8");
  const parsed = jsoncParser.parse(content);
  return isConfigRecord(parsed) ? parsed : {};
};

export const writeJsonConfig = (
  configPath: string,
  partialConfig: ConfigRecord,
  configKey: string,
): void => {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let originalContent = "";
  let existingConfig: ConfigRecord = {};

  if (fs.existsSync(configPath)) {
    originalContent = fs.readFileSync(configPath, "utf8");
    const parsed = jsoncParser.parse(originalContent);
    if (isConfigRecord(parsed)) {
      existingConfig = parsed;
    }
  }

  const mergedConfig = deepMerge(existingConfig, partialConfig);

  if (originalContent !== "") {
    try {
      const nextValue = getNestedValue(mergedConfig, configKey);
      const edits = jsoncParser.modify(originalContent, configKey.split("."), nextValue, {
        formattingOptions: detectIndent(originalContent),
      });
      const updatedContent = jsoncParser.applyEdits(originalContent, edits);
      fs.writeFileSync(configPath, updatedContent);
      return;
    } catch {
      // HACK: console.debug outside Effect context — pure sync utility cannot use Effect.logDebug
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(mergedConfig, undefined, 2));
};
