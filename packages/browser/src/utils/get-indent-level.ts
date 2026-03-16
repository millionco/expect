const INDENT_SIZE = 2;

export const getIndentLevel = (line: string): number => {
  let spaces = 0;
  while (spaces < line.length && line[spaces] === " ") spaces++;
  return Math.floor(spaces / INDENT_SIZE);
};
