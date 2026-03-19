import { createInterface } from "node:readline";

const readline = createInterface({ input: process.stdin });

const send = (message) => {
  process.stdout.write(JSON.stringify(message) + "\n");
};

const respond = (id, result) => send({ jsonrpc: "2.0", id, result });
const notify = (method, params) => send({ jsonrpc: "2.0", method, params });

let sessionCounter = 0;

readline.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    return;
  }

  const { id, method, params } = request;

  if (method === "initialize") {
    respond(id, {
      protocolVersion: params.protocolVersion,
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: { image: false, audio: false, embeddedContext: true },
        mcpCapabilities: { http: false, sse: false },
      },
      agentInfo: { name: "echo-agent", version: "1.0.0" },
    });
    return;
  }

  if (method === "session/new") {
    const sessionId = `sess_echo_${++sessionCounter}`;
    respond(id, {
      sessionId,
      modes: {
        currentModeId: "code",
        availableModes: [
          { id: "ask", name: "Ask" },
          { id: "code", name: "Code" },
        ],
      },
    });
    return;
  }

  if (method === "session/prompt") {
    const sessionId = params.sessionId;
    const userText = params.prompt
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ");

    notify("session/update", {
      sessionId,
      update: {
        sessionUpdate: "thought_message_chunk",
        content: { type: "text", text: `Thinking about: ${userText}` },
      },
    });

    notify("session/update", {
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_echo_1",
        title: "echo",
        kind: "execute",
        status: "pending",
        rawInput: { text: userText },
      },
    });

    notify("session/update", {
      sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_echo_1",
        title: "echo",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: `Echo: ${userText}` } }],
      },
    });

    notify("session/update", {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `You said: ${userText}` },
      },
    });

    respond(id, { stopReason: "end_turn" });
    return;
  }

  if (method === "session/cancel") {
    return;
  }

  respond(id, null);
});
