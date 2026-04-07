import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

vi.mock("@ai-sdk/gateway", () => ({
  gateway: (model: string) => ({ modelId: model, provider: "gateway" }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "## Login\n\n[00:03] ACTION: User clicks Sign In\n        TARGET: Sign In button\n        RESULT: Login form appears",
  }),
}));

import { extractTranscript } from "./extract-transcript";
import { generateText } from "ai";
import path from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("extractTranscript", () => {
  let tempDir: string;
  let videoPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "extract-test-"));
    videoPath = path.join(tempDir, "test.mp4");
    writeFileSync(videoPath, Buffer.from("fake video content"));
  });

  beforeEach(() => {
    vi.mocked(generateText).mockClear();
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("calls generateText with gateway model", async () => {
    const result = await extractTranscript(videoPath, undefined);

    expect(generateText).toHaveBeenCalledOnce();
    const call = vi.mocked(generateText).mock.calls[0]![0];
    expect((call.model as { modelId: string }).modelId).toBe("google/gemini-2.5-flash");
    expect(result).toContain("Login");
  });

  it("passes video data as file part with correct media type", async () => {
    await extractTranscript(videoPath, undefined);

    const call = vi.mocked(generateText).mock.calls[0]![0];
    const messages = call.messages as Array<{
      content: Array<{ type: string; mediaType?: string }>;
    }>;
    const filePart = messages[0]!.content.find((part) => part.type === "file");
    expect(filePart).toBeDefined();
    expect(filePart!.mediaType).toBe("video/mp4");
  });

  it("includes timeline in prompt when provided", async () => {
    const timeline = [
      { type: "active" as const, startSeconds: 0, endSeconds: 10 },
      { type: "idle" as const, startSeconds: 10, endSeconds: 15 },
    ];

    await extractTranscript(videoPath, timeline);

    const call = vi.mocked(generateText).mock.calls[0]![0];
    const messages = call.messages as Array<{ content: Array<{ type: string; text?: string }> }>;
    const textPart = messages[0]!.content.find((part) => part.type === "text");
    expect(textPart!.text).toContain("Activity timeline");
  });

  it("returns transcript text from generateText response", async () => {
    const result = await extractTranscript(videoPath, undefined);
    expect(result).toContain("ACTION: User clicks Sign In");
  });
});
