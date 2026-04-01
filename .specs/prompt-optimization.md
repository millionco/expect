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

## Prompt Engineering Principles

Research from Anthropic's official Claude 4.6 prompting docs, distilled into rules for this codebase's prompts.

### 1. Be clear and direct, not vague

Claude responds to explicit instructions. "Consider running audits" gets ignored. "Call `accessibility_audit` before emitting `RUN_COMPLETED`" gets followed. Think of Claude as a brilliant but new employee who lacks context on your norms. The more precisely you explain what you want, the better the result.

Golden rule: show your prompt to a colleague with minimal context. If they'd be confused, Claude will be too.

### 2. Add context to improve performance

Providing motivation behind instructions helps Claude understand goals. "NEVER use ellipses" is less effective than "Your response will be read aloud by a text-to-speech engine, so never use ellipses since the engine will not know how to pronounce them." Claude generalizes from the explanation.

For our prompts: "You are an adversarial browser tester" works better than "You are executing a browser regression test" because the adversarial framing explains the purpose behind every instruction that follows.

### 3. Structure prompts with XML tags

XML tags help Claude parse complex prompts unambiguously. Wrapping each type of content in its own tag reduces misinterpretation. Use consistent, descriptive tag names. Nest tags when content has a natural hierarchy.

For our prompts: the execution prompt uses plain string concatenation. If compliance issues persist, consider wrapping sections in XML tags (e.g., `<execution_strategy>`, `<ui_quality_rules>`, `<status_markers>`).

### 4. Give Claude a role (identity-first prompting)

Setting a role in the system prompt focuses behavior and tone. Even a single sentence makes a difference. Our identity line ("You are an adversarial browser tester. Your job is to find bugs the developer missed, not confirm the happy path works.") frames every downstream decision.

### 5. Long context: put data at the top, queries at the end

For prompts with large context (20k+ tokens), put longform data (diffs, changed files, commits) at the top and instructions/queries at the end. Queries at the end can improve response quality by up to 30% in tests.

For our prompts: `buildExecutionPrompt` correctly puts environment context and diff data in the user prompt, while behavioral instructions live in the system prompt. The system prompt ends with the RUN_COMPLETED checklist (the most critical query/instruction).

### 6. Claude 4.6 is more proactive, dial back aggressive language

Claude Opus 4.6 is more responsive to the system prompt than previous models. If prompts were designed to reduce undertriggering on tools, 4.6 may now overtrigger. Where you might have said "CRITICAL: You MUST use this tool when...", use more normal prompting like "Use this tool when...".

For our prompts: the status marker section still uses "IMPORTANT: You MUST emit these exact status markers" because the test run is unparseable without them. But other sections should avoid unnecessary CAPS/MUST language.

### 7. Tell Claude what to do, not what not to do

Instead of "Do not use markdown in your response", try "Your response should be composed of smoothly flowing prose paragraphs." Positive instructions are more effective than negative ones.

For our prompts: "Do not rush to RUN_COMPLETED" is negative. Paired it with a positive: "A thorough run that catches real issues is the goal."

### 8. Use examples effectively

A few well-crafted examples (3-5) dramatically improve accuracy and consistency. Examples should be relevant, diverse, and cover edge cases.

For our prompts: the snapshot-driven workflow section includes a concrete example (snapshot tree, ref usage, dropdown selection). The SKILL.md includes bad/good instruction examples. These are working well.

### 9. Overthinking and excessive thoroughness (Claude 4.6 specific)

Claude Opus 4.6 does significantly more upfront exploration than previous models. Previous prompts that encouraged thoroughness may now cause overtriggering. Solutions:
- Replace blanket defaults with targeted instructions ("Use tool when it would enhance understanding" not "Default to using tool")
- Remove over-prompting ("If in doubt, use tool" causes overtriggering)
- Use the `effort` parameter as a fallback

For our prompts: removed "Take your time. A thorough run that catches real issues is more valuable than a fast run that misses them." because Claude 4.6 is already thorough by default. Replaced with the concrete directive "Do not rush to RUN_COMPLETED."

### 10. Effort parameter for token control

The `effort` parameter controls how many tokens Claude uses. Levels: `max` (Opus only), `high` (default), `medium`, `low`. This affects text responses, tool calls, and thinking. Lower effort means fewer tool calls and more concise responses.

For our prompts: the ACP client currently sends sessions with `effort: "high"` via adaptive thinking for GitHub Actions. Consider `medium` for local runs where speed matters more.

### 11. Subagent orchestration awareness

Claude 4.6 has a strong predilection for spawning subagents and may overuse them. If seeing excessive subagent use, add guidance: "Use subagents when tasks can run in parallel or require isolated context. For simple tasks, work directly."

For our prompts: not directly applicable since the browser testing agent doesn't spawn subagents. But the SKILL.md's parallel execution guidance ("Launch each expect-cli call in a subagent") is correctly scoped.

### 12. Avoid overeagerness and overengineering

Claude 4.6 has a tendency to overengineer by creating extra files, adding unnecessary abstractions, or building in flexibility that wasn't requested. Prompt with: "Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused."

For our prompts: the execution prompt now has a tight scope ("find bugs the developer missed") that naturally constrains overengineering. The "Stability and recovery" section limits retries to prevent the agent from spiraling.

### 13. Minimize hallucinations in agentic coding

Claude 4.6 is less prone to hallucinations but can still speculate about code it hasn't read. For agentic contexts: "Never speculate about code you have not opened. If the user references a specific file, you MUST read the file before answering."

For our prompts: the execution prompt already requires snapshot-first workflow ("Always snapshot first, then use ref() to act. Never guess CSS selectors."), which is the browser-testing equivalent of "read before answering."

### 14. Adaptive thinking

Claude 4.6 uses adaptive thinking where it dynamically decides when and how much to think. Higher effort elicits more thinking. "Prefer general instructions over prescriptive steps. A prompt like 'think thoroughly' often produces better reasoning than a hand-written step-by-step plan."

For our prompts: the change-analysis protocol gives general goals ("Analyze EVERY changed file", "Group related files into concrete flows") rather than prescriptive step-by-step plans, which aligns with this guidance.

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

1. **XML tags for section boundaries.** Wrapping sections in tags like `<execution_strategy>` and `<status_markers>` could reduce misinterpretation in the middle of the prompt.

2. **Dynamic effort parameter.** Use `medium` effort for local runs, `high` for CI/branch reviews where thoroughness matters more.

3. **Few-shot examples for failure reports.** Adding 1-2 concrete ASSERTION_FAILED examples with proper `category=`/`domain=` formatting could improve compliance on structured failure output.

4. **Prompt templates with variables.** The execution prompt mixes fixed instructions with dynamic data (diff, changed files). Separating these with XML-tagged variables could improve long-context performance.

5. **Self-check instruction.** Adding "Before emitting RUN_COMPLETED, verify every changed file is accounted for by a tested flow or an explicit blocker" as a final self-check. Claude catches errors reliably with self-verification prompts.
