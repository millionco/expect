const LEADING_WHITESPACE_REGEX = /^(\s*)/;
const INDENT_SIZE = 2;

export const getIndentLevel = (line: string): number => {
  const match = LEADING_WHITESPACE_REGEX.exec(line);
  return match ? Math.floor(match[1].length / INDENT_SIZE) : 0;
};
