import type { StandardJSONSchemaV1 } from "@standard-schema/spec";
import type { Tool } from "./types";

type SchemaInput = StandardJSONSchemaV1 | Record<string, unknown>;

const isStandardSchema = (schema: SchemaInput): schema is StandardJSONSchemaV1 =>
  "~standard" in schema && typeof (schema as Record<string, unknown>)["~standard"] === "object";

const toInputSchema = (schema: SchemaInput): Tool["inputSchema"] => {
  if (isStandardSchema(schema)) {
    return schema["~standard"].jsonSchema.input({ target: "draft-07" }) as Tool["inputSchema"];
  }
  return schema as Tool["inputSchema"];
};

export const tool = (
  name: string,
  description: string,
  schema: SchemaInput,
  handler: (input: Record<string, unknown>) => Promise<string>,
): Tool => ({
  name,
  description,
  inputSchema: toInputSchema(schema),
  handler,
});
