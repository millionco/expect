import type { ActivityTimeline } from "./types";
import { formatTimeline } from "./activity-analyzer";

const BASE_PROMPT = `You are analyzing a screen recording of a developer interacting with a web application.
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
- For the final state, describe what the screen shows — this is the expected end state for the test.`;

export const buildTranscriptPrompt = (timeline: ActivityTimeline | undefined): string => {
  if (!timeline || timeline.length === 0) return BASE_PROMPT;

  return [
    BASE_PROMPT,
    "",
    "Activity timeline (from frame analysis):",
    formatTimeline(timeline),
    "",
    "Focus your transcript on the active segments. The idle segments have been cut from the video.",
  ].join("\n");
};
