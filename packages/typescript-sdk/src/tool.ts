import type { Tool } from "./types";

const toInputSchema = (schema: Record<string, unknown>): Tool["inputSchema"] => {
  if ("toJsonSchema" in schema && typeof schema.toJsonSchema === "function") {
    return schema.toJsonSchema() as Tool["inputSchema"];
  }
  return schema as Tool["inputSchema"];
};

export const tool = (
  name: string,
  description: string,
  schema: Record<string, unknown>,
  handler: (input: Record<string, unknown>) => Promise<string>,
): Tool => ({
  name,
  description,
  inputSchema: toInputSchema(schema),
  handler,
});
