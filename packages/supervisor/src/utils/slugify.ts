const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]+/g;
const EDGE_HYPHEN_PATTERN = /^-+|-+$/g;

export const slugify = (value: string): string => {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_PATTERN, "-")
    .replace(EDGE_HYPHEN_PATTERN, "");

  return normalizedValue || "untitled-flow";
};
