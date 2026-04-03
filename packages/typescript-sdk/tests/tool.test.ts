import { describe, it, expect } from "vite-plus/test";
import { tool } from "../src/tool";

describe("tool", () => {
  it("creates a tool with name, description, schema, handler", () => {
    const handler = async (input: Record<string, unknown>) => `Created ${input.email}`;
    const result = tool(
      "create_user",
      "Create a test user",
      { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
      handler,
    );

    expect(result.name).toBe("create_user");
    expect(result.description).toBe("Create a test user");
    expect(result.inputSchema).toEqual({
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    });
    expect(result.handler).toBe(handler);
  });

  it("handler receives parsed input and returns string", async () => {
    const myTool = tool(
      "greet",
      "Greet user",
      { type: "object", properties: { name: { type: "string" } } },
      async (input) => `Hello ${input.name}`,
    );

    const result = await myTool.handler({ name: "Alice" });
    expect(result).toBe("Hello Alice");
  });

  it("tools compose via arrays", () => {
    const toolA = tool("a", "tool a", {}, async () => "a");
    const toolB = tool("b", "tool b", {}, async () => "b");
    const combined = [toolA, toolB];

    expect(combined).toHaveLength(2);
    expect(combined[0].name).toBe("a");
    expect(combined[1].name).toBe("b");
  });

  it("extracts JSON Schema from StandardJSONSchemaV1", () => {
    const standardSchema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        jsonSchema: {
          input: () => ({ type: "object", properties: { id: { type: "string" } } }),
          output: () => ({ type: "object", properties: { id: { type: "string" } } }),
        },
      },
    };
    const result = tool("test", "test tool", standardSchema, async () => "ok");
    expect(result.inputSchema).toEqual({ type: "object", properties: { id: { type: "string" } } });
  });
});
