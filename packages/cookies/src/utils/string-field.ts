export const stringField = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
