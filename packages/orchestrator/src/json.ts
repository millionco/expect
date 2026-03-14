const JSON_CODE_BLOCK_PATTERN = /```json\s*([\s\S]*?)```/i;

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

const extractBalancedJsonObject = (input: string): string | null => {
  const firstBraceIndex = input.indexOf("{");
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

export const extractJsonObject = (input: string): string => {
  const codeBlockJson = extractFromCodeBlock(input);
  if (codeBlockJson) return normalizeJsonCandidate(codeBlockJson);

  const balancedJsonObject = extractBalancedJsonObject(input);
  if (balancedJsonObject) return normalizeJsonCandidate(balancedJsonObject);

  throw new Error("The model did not return a JSON object.");
};
