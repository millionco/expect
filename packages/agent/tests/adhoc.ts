import { createCursorModel } from "../src/cursor";

const main = async () => {
  const model = createCursorModel({ cwd: process.cwd() });

  console.log("=== doGenerate ===");
  const result = await model.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "What is 2 + 2?" }] }],
  });
  console.log("content:", JSON.stringify(result.content, null, 2));
  console.log("sessionId:", result.providerMetadata?.["browser-tester-agent"]);

  console.log("\n=== doStream ===");
  const { stream } = await model.doStream({
    prompt: [{ role: "user", content: [{ type: "text", text: "What is 2 + 2?" }] }],
  });
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.type === "text-delta") process.stdout.write(value.delta);
    else if (value.type === "reasoning-delta") process.stdout.write(`[thinking] ${value.delta}`);
    else if (value.type === "finish") console.log("\n[finish]");
  }

  console.log("\nDone.");
};

main();
