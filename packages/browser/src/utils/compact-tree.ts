import { getIndentLevel } from "./get-indent-level";

const REF_MARKER = "[ref=";

const isContentLine = (line: string): boolean =>
  line.includes(REF_MARKER) || (line.includes(":") && !line.endsWith(":"));

export const compactTree = (tree: string): string => {
  const lines = tree.split("\n");
  const indents = lines.map(getIndentLevel);
  const retained = new Array<boolean>(lines.length).fill(false);
  const parentStack: number[] = [];

  for (let index = lines.length - 1; index >= 0; index--) {
    if (!isContentLine(lines[index])) continue;

    retained[index] = true;

    parentStack.length = 0;
    for (let ancestor = index - 1; ancestor >= 0; ancestor--) {
      if (indents[ancestor] >= indents[index]) continue;
      if (retained[ancestor]) break;
      retained[ancestor] = true;
      parentStack.push(ancestor);
    }
  }

  return lines.filter((_, index) => retained[index]).join("\n");
};
