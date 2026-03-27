import { describe, expect, it } from "vite-plus/test";
import { Schema } from "effect";
import { AcpSessionUpdate } from "../src/models";

const decodeAcpSessionUpdate = Schema.decodeSync(AcpSessionUpdate);

describe("AcpSessionUpdate", () => {
  it("decodes known session updates", () => {
    const update = decodeAcpSessionUpdate({
      sessionUpdate: "available_commands_update",
    });

    expect(update.sessionUpdate).toBe("available_commands_update");
  });

  it("preserves unknown session updates when constructed upstream", () => {
    const update = decodeAcpSessionUpdate({
      sessionUpdate: "mystery_update",
      raw: { sessionUpdate: "mystery_update", payload: { hello: "world" } },
      decodeError: "unexpected session update",
    });

    expect(update.sessionUpdate).toBe("mystery_update");
    expect("raw" in update).toBe(true);
  });
});
