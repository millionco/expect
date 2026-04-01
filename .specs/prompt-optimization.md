# Prompt Optimization

Applied skill-writing principles to the execution system prompt (`packages/shared/src/prompts.ts`) and the expect skill (`packages/expect-skill/SKILL.md`).

## Problem

The system prompt had ~200 lines of instructions. Models reliably follow ~150 instructions before compliance degrades. Critical rules (status markers, RUN_COMPLETED checklist) were buried in the middle where attention is lowest. The skill file had its mandatory completion checklist in the middle, not at the end.

## Changes

### prompts.ts

1. **Reordered for peripheral-position attention.** Status marker protocol, failure report format, and RUN_COMPLETED checklist moved to the end of the prompt. Stability/recovery/rabbit-hole guidance moved before them (important but not critical).

2. **Stripped inline Playwright code from UI quality rules.** The agent already knows Playwright. Behavioral instructions ("measure CLS, fail above 0.1") drive compliance. Code samples ("return await page.evaluate(() => new Promise(resolve => { ... }))") burn budget without adding compliance. Saved ~17 lines.

3. **Merged redundant sections.** "Assertion depth" folded into "Execution strategy" (both governed per-step verification). "Stability heuristics", "Recovery policy", and "Avoid rabbit holes" merged into "Stability and recovery" (all governed what to do when stuck). Saved ~14 lines.

4. **Removed hedging.** "when relevant" on durability checks gave the agent an escape hatch. "Take your time. A thorough run..." was vibes, not instructions. Replaced with concrete directives.

5. **Sharpened identity line.** "You are executing a browser regression test directly from repository context" is procedural. Changed to "You are an adversarial browser tester. Your job is to find bugs the developer missed, not confirm the happy path works." This frames every decision the agent makes.

6. **Added `domain=` tag to failure format.** Each ASSERTION_FAILED now includes a domain tag (design-system, responsive, touch, cross-browser, dark-mode, layout-stability, font-loading, accessibility, performance, animation, seo, security, general). This lets the outer coding agent match failures to the correct sub-skill for fixing.

### SKILL.md

1. **Moved "Before Claiming Completion" to last section.** Was in the middle, separated from the end by Reference Skills and "When Expect Itself Fails". Now the mandatory completion checklist is the last thing the agent reads before acting.

2. **Connected sub-skills to the prompt's quality checks.** The Reference Skills section now explains that expect-cli runs built-in quality checks and failures include a `domain=` tag. Sub-skill `<important>` blocks include `domain=` triggers so the outer agent can route failures to the right fixing guide.

3. **Removed process summary from description.** "Covers functional testing, accessibility (WCAG), and performance (Web Vitals)" was summarizing the skill's process. Per skill-writing guidelines, this causes agents to follow the summary instead of loading the full skill. Replaced with a trigger condition ("fix expect-cli failures").

## Principles Applied

- **Peripheral positions get more attention.** First and last sections of a prompt receive disproportionate attention. Critical rules go there.
- **Instructions are a finite budget.** Every line added degrades compliance across all instructions. Strip what the agent already knows.
- **Specificity drives compliance.** "domain=responsive" is actionable. "consider the relevant domain" is not.
- **Unconditional beats conditional.** "You MUST call X" works. "When appropriate, consider X" does not.
- **No redundancy.** Two sections saying the same thing burn budget twice. Merge them.
