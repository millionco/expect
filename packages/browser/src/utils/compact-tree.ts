import { getIndentLevel } from "./get-indent-level";

const REF_MARKER = "[ref=";

const isRetainedLine = (line: string): boolean =>
  line.includes(REF_MARKER) || (line.includes(":") && !line.endsWith(":"));

export const compactTree = (tree: string): string => {
  const lines = tree.split("\n");
  const indents = lines.map(getIndentLevel);
  const hasRelevantDescendant = new Array<boolean>(lines.length).fill(false);

  for (let index = lines.length - 1; index >= 0; index--) {
    if (isRetainedLine(lines[index])) {
      hasRelevantDescendant[index] = true;
      for (let parent = index - 1; parent >= 0; parent--) {
        if (indents[parent] < indents[index]) {
          if (hasRelevantDescendant[parent]) break;
          hasRelevantDescendant[parent] = true;
        }
      }
    }
  }

  const result: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (hasRelevantDescendant[index]) {
      result.push(lines[index]);
    }
  }

  return result.join("\n");
};
