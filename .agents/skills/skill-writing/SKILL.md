---
name: skill-writing
description: Write and improve agent skills (SKILL.md files). Use when creating new skills, refactoring existing ones, debugging why an agent ignores instructions, or improving compliance. Covers prompt structure, TDD for skills, description optimization, and rationalization bulletproofing.
---

# Skill Writing

Skills are bundled instruction modules that load into an agent's context when activated. They are the highest-leverage mechanism for controlling agent behavior because they deliver focused instructions at the moment of relevance.

## The Iron Law

**No skill without a failing test first.** Before writing a skill, run a subagent on the target task WITHOUT the skill. Document what it gets wrong — the exact rationalizations, shortcuts, and skipped steps. Then write the skill addressing those specific failures. This is TDD applied to documentation.

| TDD Step | Skill Equivalent |
|---|---|
| RED | Run scenario without skill. Document what the agent does wrong. |
| GREEN | Write minimal skill addressing those specific failures. Verify agent now complies. |
| REFACTOR | Find new rationalizations the agent invents. Close loopholes. Re-test. |

## When to Create a Skill

**Create when:** the technique wasn't obvious, you'd reference it across projects, others would benefit, or the agent repeatedly fails without it.

**Don't create for:** one-off solutions, standard practices documented elsewhere, project-specific conventions (use CLAUDE.md), or mechanical constraints (enforce with linters/hooks instead).

## Core Principles

**Instructions are a finite budget.** Models reliably follow ~150 instructions. The system prompt burns ~50. Every instruction you add degrades compliance across ALL instructions. Be ruthless about what earns a slot.

**Peripheral positions get more attention.** First and last sections receive disproportionate attention. Bury a critical rule in the middle and it gets skipped.

**Specificity drives compliance.** "Consider running audits" gets ignored. "Call `accessibility_audit` before emitting `RUN_COMPLETED`" gets followed.

**Unconditional beats conditional.** "You MUST call X" works. "When appropriate, consider X" does not.

## Description Optimization

The `description` field controls when the skill activates. The agent reads it to decide: "Should I load this right now?" Describe **triggering conditions**, not workflow.

**Bad:** `description: A skill for TDD - write test first, watch it fail, write code`
**Good:** `description: Use when tests have race conditions, timing dependencies, or pass/fail inconsistently. Covers flaky tests, hanging tests, zombie processes.`

Checklist for descriptions:
- Start with "Use when..." focusing on triggering conditions
- Include specific symptoms and error messages the user would mention
- Include synonyms (timeout/hang/freeze, cleanup/teardown/afterEach)
- Name tools, commands, file types that signal relevance
- Max 500 characters. Under 200 for frequently-loaded skills
- Never summarize the skill's process — this causes agents to follow the description instead of loading the full skill

## Skill Structure

```
.agents/skills/<skill-name>/
  SKILL.md          # Required. Under 200 lines.
  references/       # Optional. Heavy reference docs (100+ lines).
```

### Frontmatter

```yaml
---
name: kebab-case-name
description: Use when [triggering conditions]. Covers [symptoms, tools, keywords].
---
```

Use verb-first active naming: `creating-skills` not `skill-creation`, `condition-based-waiting` not `async-helpers`.

## Writing Instructions That Get Followed

### Lead with identity, then constraints

One-line role statement, then hard constraints immediately. Do not build up to them.

```markdown
# Browser Test Executor

You are executing adversarial browser tests against code changes.

REQUIRED for every test run:
1. Call accessibility_audit before completing
2. Call performance_metrics before completing
3. Call close to flush the session
```

### Use numbered checklists gated on completion

Numbered lists signal sequence and completeness. Tie them to whatever marks the task "done."

```markdown
Before marking the task complete, you MUST:
1. Run the linter
2. Run the type checker
3. Run the test suite
Do not skip any step. A skipped step is a failed task.
```

The trailing "do not skip" is not redundant — it closes the escape hatch.

### Name tools and commands exactly

Never "run the appropriate checks." Always `call accessibility_audit` or `run pnpm typecheck`.

### Put mandatory behaviors at the end

The last section is the last thing read before acting. Put the non-negotiable checklist there.

### One good example, one bad example

Examples are worth more than explanations.

```markdown
**Bad:** `test the login page`
**Good:** `Submit login with empty fields, invalid email, wrong password, valid credentials. Verify errors and redirect.`
```

## Bulletproofing Against Rationalization

Agents invent reasons to skip rules. Anticipate and close every loophole explicitly.

**Close escape hatches:** After every mandatory rule, add: "No exceptions for 'just this once', 'it's simple enough', or 'I'll do it next time'."

**Build a rationalization table** from your RED phase testing. Every excuse the agent made becomes an explicit counter in the skill:

| Agent Says | Skill Responds |
|---|---|
| "This change is too small to test" | Every change gets tested. Size is not an exemption. |
| "I already verified manually" | Manual verification is not a substitute. Run the tool. |
| "The user didn't ask for this" | The skill requires it. User silence is not opt-out. |

**Create a red flags list:** "If you catch yourself thinking any of these, stop and follow the checklist."

## Anti-Patterns

| Pattern | Why It Fails |
|---|---|
| "Consider running X when appropriate" | Conditional + vague = ignored |
| Giant skill files (>200 lines) | Exceeds instruction budget, compliance drops |
| Duplicating CLAUDE.md rules | Burns budget twice for the same instruction |
| Listing every edge case | Show one example, not twenty — the agent infers the rest |
| "Be thorough" / "Be careful" | Vibes, not instructions. Say what "thorough" means concretely |
| Multi-paragraph justifications | The agent needs the rule, not the backstory. One sentence of "why" max |
| Critical rules in the middle | Middle-of-prompt blindspot. Move to top or bottom |
| Writing a skill without testing first | You don't know what failures to address. Delete it, start with RED. |
| Workflow-summarizing descriptions | Agent follows the summary instead of loading the full skill |

## Checklist: Before Shipping

- [ ] Tested without the skill first (RED phase) and documented failures
- [ ] Skill addresses those specific failures, not hypothetical ones
- [ ] Description starts with "Use when..." and lists triggering conditions, not workflow
- [ ] Under 200 lines total
- [ ] Mandatory behaviors in a numbered checklist at top or bottom
- [ ] Every tool/command named exactly — no "appropriate" or "relevant"
- [ ] No hedging ("consider", "when appropriate", "if needed")
- [ ] At least one good/bad example pair
- [ ] No duplication with CLAUDE.md or other skills
- [ ] Escape hatches closed with explicit "no exceptions" language
- [ ] Re-tested with the skill (GREEN phase) and agent now complies
