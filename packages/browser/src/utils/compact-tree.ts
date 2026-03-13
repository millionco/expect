import { getIndentLevel } from "./get-indent-level";

const REF_MARKER = "[ref=";

export const compactTree = (tree: string): string => {
  const lines = tree.split("\n");
  const result: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (line.includes(REF_MARKER)) {
      result.push(line);
      continue;
    }

    if (line.includes(":") && !line.endsWith(":")) {
      result.push(line);
      continue;
    }

    const currentIndent = getIndentLevel(line);
    let hasRelevantChildren = false;

    for (let child = index + 1; child < lines.length; child++) {
      const childIndent = getIndentLevel(lines[child]);
      if (childIndent <= currentIndent) break;
      if (lines[child].includes(REF_MARKER)) {
        hasRelevantChildren = true;
        break;
      }
    }

    if (hasRelevantChildren) {
      result.push(line);
    }
  }

  return result.join("\n");
};
