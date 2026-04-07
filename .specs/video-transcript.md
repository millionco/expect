# Video Transcript

Accept a screen recording of a user interacting with a web app, extract a structured interaction transcript via Gemini's native video understanding, and compound it with the existing git diff context to produce higher-quality test plans.

---

## Problem

Today the developer describes what to test in two ways: a text instruction (`--message`) and/or a git diff. Both are lossy.

- **Text instruction** is underspecified. "Test the checkout flow" doesn't tell the agent which buttons to click, what data to enter, or what the expected result looks like.
- **Git diff** shows what changed in code but not how the feature looks or behaves at runtime.

The agent has to guess the user's intended workflow, discover the UI structure through trial and error, and invent test data. This wastes tokens and produces shallow coverage.

A screen recording of the developer using the feature is the densest possible description of intent. It shows the exact workflow, the UI layout, the data, the navigation sequence, and the expected behavior — all without requiring the developer to articulate it in text.

---

## Design

### Pipeline overview

```
video file → idle-time cutting → Gemini transcript extraction → compound with diff → agent executes
```

1. **Input**: Developer provides a video file path via `--video <path>`.
2. **Preprocessing**: Detect and cut idle segments to reduce token cost and noise.
3. **Transcript extraction**: Upload the trimmed video to Gemini, prompt for a structured interaction transcript.
4. **Prompt composition**: Insert the transcript into `buildExecutionPrompt` as a new `<developer_demonstration>` section alongside the existing diff, changed files, and instruction.
5. **Execution**: The existing agent pipeline runs unchanged — it just has richer context.

### Step 1: Idle-time cutting

Screen recordings have dead time — starting the recorder, reading content, thinking, waiting for page loads, stopping the recorder. This wastes tokens (~300/sec at default Gemini resolution) and adds noise to the transcript.

**Frame differencing** preprocesses the video to identify active vs. idle segments:

1. Decode frames at 1 FPS (matching Gemini's default sampling rate).
2. Compare consecutive frames using mean pixel difference (grayscale, normalized 0–1).
3. Classify each second as **active** (diff > threshold) or **idle** (diff ≤ threshold).
4. Merge consecutive idle seconds into idle segments.
5. Trim leading/trailing idle segments entirely.
6. For interior idle segments longer than `IDLE_CUT_THRESHOLD_SECONDS`, cut them and insert a `[idle: Ns]` marker so the transcript preserves timing context.
7. Concatenate active segments (plus short idle gaps ≤ threshold that serve as natural pauses) into a trimmed video.

**Heuristics and constants**:

| Constant | Value | Rationale |
|---|---|---|
| `FRAME_DIFF_IDLE_THRESHOLD` | 0.005 | Normalized mean pixel diff below this = idle. Accounts for compression artifacts and cursor blink. |
| `IDLE_CUT_THRESHOLD_SECONDS` | 3 | Interior idle segments shorter than this are kept (natural micro-pauses between interactions). Longer ones are cut. |
| `LEADING_TRIM_THRESHOLD` | 0 | Always trim idle frames at the start. |
| `TRAILING_TRIM_THRESHOLD` | 0 | Always trim idle frames at the end. |
| `MIN_ACTIVE_SEGMENT_SECONDS` | 1 | Active segments shorter than this are treated as noise (compression glitches). |

**Scene change detection** as a secondary signal: when frame diff exceeds a high threshold (`SCENE_CHANGE_THRESHOLD = 0.15`), that's likely a page navigation. These are natural segment boundaries and become step breaks in the transcript prompt.

**Output**: A trimmed video file (written to a temp directory) and an `ActivityTimeline` — an ordered list of `{ type: "active" | "idle" | "scene_change", startSeconds: number, endSeconds: number }` segments. The timeline is passed to the transcript prompt so Gemini knows the temporal structure without re-discovering it.

**Implementation**: Use `ffmpeg` (via child process) for frame extraction and video concatenation. ffmpeg is nearly universal on developer machines and avoids pulling in heavy native Node dependencies. The frame comparison itself is pure TypeScript operating on raw pixel buffers from PNG frames.

**Fallback**: If ffmpeg is not available, skip preprocessing entirely and upload the raw video. The transcript prompt instructs Gemini to ignore idle periods. This is the "lazy" path — higher cost but zero dependencies.

### Step 2: Transcript extraction via Gemini

**Why Gemini**: It's the only major model with native video input. No frame extraction, no base64 image sequences, no ffmpeg dependency for the core path. Upload the file, get a response. Gemini 2.5 Flash processes up to ~45 min of video at ~$0.005/min — a 2-minute screen recording costs about a cent.

**Why AI SDK**: The codebase already uses `@ai-sdk/provider`. Using `@ai-sdk/google` + `ai` (generateText) keeps the dependency surface unified instead of adding a separate `@google/genai` SDK. AI SDK's `file` content part handles video natively with the Google provider, and auto-uploads large files via the Google Files API.

**API flow**:

```ts
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import * as fs from "node:fs";

const { text } = await generateText({
  model: google("gemini-2.5-flash"),
  messages: [{
    role: "user",
    content: [
      { type: "file", data: fs.readFileSync(videoPath), mimeType: "video/mp4" },
      { type: "text", text: transcriptPrompt },
    ],
  }],
});
```

**Transcript prompt** (the prompt sent alongside the video):

```
You are analyzing a screen recording of a developer interacting with a web application.
Produce a structured interaction transcript describing every user action and observable
UI response. This transcript will be used to generate automated browser tests.

Format each interaction as a timestamped entry:

[MM:SS] ACTION: <what the user did>
        TARGET: <what UI element they interacted with — be specific: button label, input field name, menu item, link text>
        RESULT: <what happened in the UI after the action — page navigation, content change, modal appearance, error message, loading state, etc.>
        URL: <the URL visible in the browser, if observable>

Group related interactions into logical steps separated by blank lines.
Add a one-line summary at the start of each group describing the workflow phase
(e.g., "## Login", "## Add item to cart", "## Complete checkout").

Rules:
- Describe what you SEE, not what you infer. If you can read text on screen, quote it.
- Include the URL or route when visible in the address bar.
- Note form field values the user types (mask passwords as "***").
- Note any error messages, toasts, validation messages, or loading spinners.
- Skip idle periods where nothing happens. If there's a gap, note it as [MM:SS] IDLE: ~Ns.
- For the final state, describe what the screen shows — this is the expected end state for the test.
```

If an activity timeline is available from preprocessing, append it to the prompt:

```
Activity timeline (from frame analysis):
- [00:00–00:02] idle (recording start)
- [00:03–00:11] active
- [00:11–00:11] scene change (likely navigation)
- [00:12–00:18] idle
- [00:19–00:31] active
- [00:31–00:33] idle (recording end)

Focus your transcript on the active segments. The idle segments have been cut from the video.
```

**Output**: A string containing the structured transcript. No schema parsing needed — this is free-form text that goes directly into the execution prompt.

### Step 3: Prompt composition

Add a new section to `buildExecutionPrompt` in `packages/shared/src/prompts.ts`:

```ts
...(options.videoTranscript?.trim()
  ? [
      "<developer_demonstration>",
      "The developer recorded a video demonstrating the workflow to test. Below is a transcript of their interactions.",
      "Use this as your primary guide for WHAT to test and HOW to navigate the application.",
      "The transcript shows the intended happy path — you should also test edge cases and error states around this workflow.",
      "",
      options.videoTranscript.trim(),
      "</developer_demonstration>",
      "",
    ]
  : []),
```

This slots in before `<developer_request>`. The instruction (`--message`) can now be optional when `--video` is provided — the transcript *is* the instruction. If both are provided, the text instruction acts as a focus hint ("pay extra attention to the express shipping option").

Add to the system prompt a brief note in `<change_analysis>`:

```
- If a <developer_demonstration> transcript is provided, it shows the developer's intended workflow.
  Reproduce their exact flow first, then extend with edge cases and adjacent flows per the scope strategy.
  Match UI elements by label/text from the transcript rather than guessing selectors.
```

### CLI interface

Add a `--video` flag to the main `expect` command:

```
expect --video ./checkout-flow.mp4
expect --video ./demo.webm -m "focus on the new shipping options"
expect --video ./flow.mp4 --target branch
```

Accepted formats: MP4, WebM, MOV (matching Gemini's supported formats). The flag accepts a file path. Validate the file exists and has a supported extension before proceeding.

When `--video` is provided without `--message`, the instruction defaults to: "Test the workflow demonstrated in the video recording."

### Configuration

Gemini API key via the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable (AI SDK's default for `@ai-sdk/google`). Alternatively, pass `apiKey` to `createGoogleGenerativeAI()`.

The key is required only when `--video` is used. If missing, fail with a clear error: "GOOGLE_GENERATIVE_AI_API_KEY environment variable is required for video transcript extraction."

---

## Service design

### `VideoTranscript` service

New service in `packages/supervisor/src/video-transcript.ts`:

```ts
export class VideoTranscript extends ServiceMap.Service<VideoTranscript>()("@supervisor/VideoTranscript", {
  make: Effect.gen(function* () {
    const extractTranscript = Effect.fn("VideoTranscript.extractTranscript")(
      function* (videoPath: string) {
        yield* Effect.annotateCurrentSpan({ videoPath });

        const timeline = yield* analyzeActivity(videoPath);
        const processedPath = yield* cutIdleSegments(videoPath, timeline);
        const transcript = yield* callGemini(processedPath, timeline);

        yield* Effect.logInfo("Video transcript extracted", {
          originalPath: videoPath,
          activeSegments: timeline.filter(s => s.type === "active").length,
          transcriptLength: transcript.length,
        });

        return transcript;
      }
    );

    return { extractTranscript } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
```

Internal functions (not exported on the service):

- `analyzeActivity(videoPath: string)` — ffmpeg frame extraction + pixel diff → `ActivityTimeline`
- `cutIdleSegments(videoPath: string, timeline: ActivityTimeline)` — ffmpeg concat filter → trimmed video path
- `callGemini(videoPath: string, timeline: ActivityTimeline)` — AI SDK generateText with Google provider → transcript string

### Error types

```ts
export class VideoFileNotFoundError extends Schema.ErrorClass<VideoFileNotFoundError>(
  "VideoFileNotFoundError",
)({
  _tag: Schema.tag("VideoFileNotFoundError"),
  videoPath: Schema.String,
}) {
  message = `Video file not found: ${this.videoPath}`;
}

export class VideoTranscriptExtractionError extends Schema.ErrorClass<VideoTranscriptExtractionError>(
  "VideoTranscriptExtractionError",
)({
  _tag: Schema.tag("VideoTranscriptExtractionError"),
  cause: Schema.String,
}) {
  message = `Failed to extract video transcript: ${this.cause}`;
}

export class FfmpegNotFoundError extends Schema.ErrorClass<FfmpegNotFoundError>(
  "FfmpegNotFoundError",
)({
  _tag: Schema.tag("FfmpegNotFoundError"),
}) {
  message = "ffmpeg not found. Video will be uploaded without idle-time cutting. Install ffmpeg for optimized processing.";
}
```

`FfmpegNotFoundError` is recoverable — caught and logged as a warning, then the raw video is uploaded directly.

---

## Integration with Executor

`ExecuteOptions` gains an optional `videoTranscript` field:

```ts
export interface ExecuteOptions {
  // ... existing fields ...
  readonly videoTranscript?: string;
}
```

The transcript is extracted *before* calling `executor.execute` — either in the CLI layer (for interactive mode) or in `runHeadlessForTarget` (for CI/headless mode). The executor receives the already-extracted transcript string and passes it through to `buildExecutionPrompt`.

`ExecutionPromptOptions` gains:

```ts
export interface ExecutionPromptOptions {
  // ... existing fields ...
  readonly videoTranscript?: string;
}
```

---

## Files to change

| File | Change |
|---|---|
| `packages/supervisor/src/video-transcript.ts` | New service: VideoTranscript with extractTranscript, analyzeActivity, cutIdleSegments, callGemini |
| `packages/supervisor/src/constants.ts` | New constants: FRAME_DIFF_IDLE_THRESHOLD, IDLE_CUT_THRESHOLD_SECONDS, SCENE_CHANGE_THRESHOLD, MIN_ACTIVE_SEGMENT_SECONDS |
| `packages/supervisor/src/executor.ts` | Add videoTranscript to ExecuteOptions, pass through to buildExecutionPrompt |
| `packages/supervisor/package.json` | Add `@ai-sdk/google` and `ai` dependencies |
| `packages/shared/src/prompts.ts` | Add videoTranscript to ExecutionPromptOptions, add `<developer_demonstration>` section to buildExecutionPrompt, add note to system prompt |
| `apps/cli/src/index.tsx` | Add `--video <path>` CLI flag, wire through to execution |
| `apps/cli/src/components/screens/main-menu-screen.tsx` | Pass video transcript to testing screen when available |
| `apps/cli/src/components/screens/testing-screen.tsx` | Accept and pass videoTranscript to execute options |
| `apps/cli/src/data/execution-atom.ts` | Thread videoTranscript through to executor |

---

## Design decisions

| Decision | Rationale |
|---|---|
| Gemini over GPT/Claude for video | Only model with native video input. No frame extraction, no base64 encoding, no ffmpeg hard dependency for the core path. Cheapest per-minute cost. |
| Gemini 2.5 Flash over Pro | Flash is 10x cheaper, fast enough for transcript extraction, and handles up to 45 min of video. Pro is overkill for describing UI interactions. |
| AI SDK over `@google/genai` | Codebase already uses `@ai-sdk/provider`. AI SDK's `@ai-sdk/google` provides a unified `generateText` API with file part support — no need for a second SDK with different patterns. Keeps provider-switching open (could swap to Vertex AI or another provider later). |
| ffmpeg for preprocessing over native Node | ffmpeg is the standard for video processing, nearly universal on dev machines, and handles frame extraction + concatenation in single commands. Native alternatives (fluent-ffmpeg, sharp) add large dependencies. |
| Graceful degradation without ffmpeg | Preprocessing is an optimization, not a requirement. Raw video upload works fine — just costs more tokens. Warning instead of hard failure. |
| Frame diff at 1 FPS | Matches Gemini's default sampling rate. No point detecting sub-second idle periods when Gemini only sees 1 frame/sec. |
| Transcript as free-form text | No schema enforcement on the Gemini output. The transcript is consumed by another LLM (the test agent), not by code. Structured JSON would add parsing fragility for no benefit. |
| Transcript extraction before executor | Keeps the executor simple — it just receives a string. Allows the CLI to show a progress indicator during the (potentially slow) Gemini call before the test run starts. |
| `--video` without `--message` is valid | The video IS the instruction. Making `--message` required when `--video` is provided would be redundant friction. |
| Separate service, not inline in executor | Video processing is a distinct concern with its own dependencies (Gemini SDK, ffmpeg). Keeping it in a separate service follows the existing pattern (Git, FlowStorage, TestCoverage). |
| Activity timeline passed to Gemini prompt | Telling Gemini which segments are active vs idle (from frame analysis) reduces hallucination in the transcript. Gemini doesn't have to rediscover temporal structure — it can focus on describing interactions. |

---

## Future extensions

- **URL auto-detection**: Extract the base URL from the video transcript (visible in the address bar) and auto-set `--url`, eliminating one more manual input.
- **Saved flow from video**: Convert the transcript directly into a SavedFlow for replay without re-processing the video.
- **YouTube URL input**: Gemini supports YouTube URLs natively. `expect --video https://youtube.com/watch?v=...` for shared recordings.
- **Multi-video composition**: Gemini 2.5 supports up to 10 videos per request. Could accept multiple `--video` flags for different workflows in one run.
- **Two-pass optimization**: For long recordings (>5 min), first pass at low resolution to identify interaction segments, second pass at full resolution on just those segments. Reduces cost ~3x.
- **Audio narration extraction**: If the developer narrates while recording ("now I'm going to test the error case"), Gemini can extract that as supplementary context. The transcript prompt already handles audio track — no code changes needed, just prompt tuning.
