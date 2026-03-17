const JSON_CODE_BLOCK_PATTERN = /```json\s*([\s\S]*?)```/i;

const VALID_JSON_ESCAPE_CHARS = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);
const UNICODE_HEX_LENGTH = 4;
const HEX_PATTERN = /^[0-9a-fA-F]{4}$/;

const extractFromCodeBlock = (input: string): string | null => {
  const codeBlockMatch = input.match(JSON_CODE_BLOCK_PATTERN);
  if (!codeBlockMatch) return null;
  return codeBlockMatch[1].trim();
};

const normalizeJsonCandidate = (input: string): string => {
  const trimmedInput = input.trim();
  const looksEscaped =
    trimmedInput.startsWith("\\n") ||
    trimmedInput.startsWith('\\"') ||
    trimmedInput.includes('\\"title\\"') ||
    trimmedInput.includes("\\n{");

  if (!looksEscaped) return trimmedInput;

  return trimmedInput.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
};

const sanitizeInvalidJsonEscapes = (input: string): string => {
  const characters: string[] = [];
  let insideString = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (!insideString) {
      characters.push(character);
      if (character === '"') insideString = true;
      continue;
    }

    if (character === "\\") {
      const nextCharacter = input[index + 1];

      if (nextCharacter === "u") {
        const hexSequence = input.slice(index + 2, index + 2 + UNICODE_HEX_LENGTH);
        if (hexSequence.length === UNICODE_HEX_LENGTH && HEX_PATTERN.test(hexSequence)) {
          characters.push("\\", "u", ...hexSequence);
          index += 1 + UNICODE_HEX_LENGTH;
        } else {
          characters.push("\\", "\\");
        }
      } else if (nextCharacter !== undefined && VALID_JSON_ESCAPE_CHARS.has(nextCharacter)) {
        characters.push(character, nextCharacter);
        index += 1;
      } else {
        characters.push("\\", "\\");
      }
      continue;
    }

    if (character === '"') {
      characters.push(character);
      insideString = false;
      continue;
    }

    characters.push(character);
  }

  return characters.join("");
};

const extractBalancedJsonObjectAt = (input: string, startIndex: number): string | null => {
  const firstBraceIndex = input.indexOf("{", startIndex);
  if (firstBraceIndex === -1) return null;

  let depth = 0;
  let isInsideString = false;
  let isEscaped = false;

  for (let currentIndex = firstBraceIndex; currentIndex < input.length; currentIndex += 1) {
    const currentCharacter = input[currentIndex];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (currentCharacter === "\\") {
      isEscaped = true;
      continue;
    }

    if (currentCharacter === '"') {
      isInsideString = !isInsideString;
      continue;
    }

    if (isInsideString) continue;

    if (currentCharacter === "{") depth += 1;
    if (currentCharacter === "}") depth -= 1;

    if (depth === 0) {
      return input.slice(firstBraceIndex, currentIndex + 1);
    }
  }

  return null;
};

const findLargestJsonObject = (input: string): string | null => {
  let largest: string | null = null;
  let searchFrom = 0;

  for (;;) {
    const candidate = extractBalancedJsonObjectAt(input, searchFrom);
    if (!candidate) break;

    if (!largest || candidate.length > largest.length) {
      largest = candidate;
    }

    searchFrom = input.indexOf(candidate, searchFrom) + candidate.length;
  }

  return largest;
};

export const extractJsonObject = (input: string): string => {
  const codeBlockJson = extractFromCodeBlock(input);
  if (codeBlockJson) return sanitizeInvalidJsonEscapes(normalizeJsonCandidate(codeBlockJson));

  const largest = findLargestJsonObject(input);
  if (!largest) {
    throw new Error("The model did not return a JSON object.");
  }

  return sanitizeInvalidJsonEscapes(normalizeJsonCandidate(largest));
};
