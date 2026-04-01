# Prompt Optimization

Applied prompt engineering research (Anthropic's official guidance for Claude 4.6) and skill-writing principles to the execution system prompt (`packages/shared/src/prompts.ts`) and the expect skill (`packages/expect-skill/SKILL.md`).

Sources: [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices), [Effort parameter](https://platform.claude.com/docs/en/build-with-claude/effort), [Prompting tools](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-tools)

## Problem

The system prompt had ~200 lines of instructions. Critical rules (status markers, RUN_COMPLETED checklist) were buried in the middle where attention is lowest. The skill file had its mandatory completion checklist in the middle, not at the end. Inline code samples burned instruction budget teaching the agent things it already knows.

## Changes Made

### prompts.ts

1. **Reordered for peripheral-position attention.** Status marker protocol, failure report format, and RUN_COMPLETED checklist moved to the end. Stability/recovery guidance moved before them.

2. **Stripped inline Playwright code from UI quality rules.** Behavioral instructions ("measure CLS, fail above 0.1") drive compliance. Code samples burn budget without adding compliance. Saved ~17 lines.

3. **Merged redundant sections.** "Assertion depth" folded into "Execution strategy". "Stability heuristics", "Recovery policy", and "Avoid rabbit holes" merged into "Stability and recovery". Saved ~14 lines.

4. **Removed hedging.** "when relevant" on durability checks gave the agent an escape hatch. "Take your time" is vibes, not an instruction. Replaced with concrete directives.

5. **Sharpened identity line.** Changed from procedural ("executing a browser regression test") to adversarial framing ("find bugs the developer missed"). This frames every decision the agent makes.

6. **Added `domain=` tag to failure format.** Each ASSERTION_FAILED now includes a domain tag (design-system, responsive, touch, etc.). This lets the outer coding agent match failures to the correct sub-skill.

### SKILL.md

1. **Moved "Before Claiming Completion" to last section.** Now the mandatory completion checklist is the last thing the agent reads before acting.

2. **Connected sub-skills to the prompt's quality checks via `domain=` tags.**

3. **Removed process summary from description.** Replaced with trigger condition ("fix expect-cli failures").

## Prompt Decisions (from Anthropic Claude 4.6 guidance)

| Principle | What we did |
|---|---|
| Be direct, not vague | Named exact tools (`accessibility_audit`, `performance_metrics`) instead of "run appropriate checks" |
| Motivate instructions | Adversarial framing ("find bugs the developer missed") explains the purpose behind every rule |
| XML tags for structure | Sections wrapped in `<change_analysis>`, `<status_markers>`, etc. |
| Identity-first prompting | Single identity line at the top frames every downstream decision |
| Data top, queries bottom | Diff/context in user prompt, behavioral rules in system prompt, RUN_COMPLETED checklist last |
| Dial back aggressive language (4.6) | Reserved CAPS/MUST for status markers only (unparseable without them). Normal tone elsewhere |
| Positive over negative | Paired "Do not rush to RUN_COMPLETED" with "A thorough run that catches real issues is the goal" |
| Avoid overtriggering (4.6) | Removed "Take your time" (4.6 is already thorough). Replaced with concrete directive |
| Tight scope prevents overengineering | Adversarial framing + retry limits in "Stability and recovery" constrain spiraling |
| Snapshot-first prevents hallucination | "Always snapshot first, then use ref() to act. Never guess CSS selectors." = read before acting |

## Peripheral Position Rule (the most impactful principle)

First and last sections of a prompt receive disproportionate attention. Middle sections get skipped. This is the single highest-leverage optimization.

Current prompt structure (after optimization):

```
TOP (high attention):
  Identity line (adversarial framing)
  Change-analysis protocol
  Coverage planning rules

MIDDLE (lower attention):
  Execution strategy (merged with assertion depth)
  UI quality rules (compressed, no inline code)
  Browser tool descriptions
  Snapshot workflow + examples
  Code-level fallback
  Project healthcheck
  Stability and recovery (merged from 3 sections)

BOTTOM (high attention):
  Status marker protocol
  Failure report format (with domain= tags)
  REQUIRED before RUN_COMPLETED checklist
```

## Future Optimization Opportunities

1. **Dynamic effort parameter.** Use `medium` effort for local runs, `high` for CI/branch reviews where thoroughness matters more.

2. **Few-shot examples for failure reports.** Adding 1-2 concrete ASSERTION_FAILED examples with proper `category=`/`domain=` formatting could improve compliance on structured failure output.
