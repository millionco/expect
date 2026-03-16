import { Option } from "effect";
import { EXCLUDED_ARIA_ROLE } from "../constants";
import type { ParsedAriaLine } from "../types";

const ARIA_LINE_REGEX = /- (\w+)\s*(?:"((?:[^"\\]|\\.)*)")?/;

export const parseAriaLine = (line: string): Option.Option<ParsedAriaLine> => {
  const match = ARIA_LINE_REGEX.exec(line);
  if (!match) return Option.none();

  const role = match[1];
  if (role === EXCLUDED_ARIA_ROLE) return Option.none();

  const name = match[2]?.replace(/\\(.)/g, "$1") ?? "";
  return Option.some({ role, name });
};
