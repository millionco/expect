# Video Input

Accept a screen recording as input to generate a test plan, using Gemini's native video understanding to extract a step-by-step transcript of user interactions.

## Usage

```bash
expect --video recording.mp4
expect --video ~/Desktop/demo.mov --url http://localhost:3000
```

## Future Extensions

- **URL auto-detection**: Extract the base URL from the video transcript (visible in the address bar) and auto-set `--url`, eliminating one more manual input.
- **Saved flow from video**: Convert the transcript directly into a SavedFlow for replay without re-processing the video.
- **YouTube URL input**: Gemini supports YouTube URLs natively. `expect --video https://youtube.com/watch?v=...` for shared recordings.
- **Multi-video composition**: Gemini 2.5 supports up to 10 videos per request. Could accept multiple `--video` flags for different workflows in one run.
- **Two-pass optimization**: For long recordings (>5 min), first pass at low resolution to identify interaction segments, second pass at full resolution on just those segments. Reduces cost ~3x.
- **Audio narration extraction**: If the developer narrates while recording ("now I'm going to test the error case"), Gemini can extract that as supplementary context. The transcript prompt already handles audio track — no code changes needed, just prompt tuning.
