---
name: skill-writing
description: Write and improve agent skills (SKILL.md files). Use when creating new skills, refactoring existing ones, debugging why an agent ignores instructions, or improving compliance. Covers prompt structure, TDD for skills, description optimization, and rationalization bulletproofing.
---

# Skill Writing

## Checklist

### The Iron Law

- [ ] Run the scenario WITHOUT the skill first (RED phase) — document failures
- [ ] Write minimal skill addressing those specific failures (GREEN phase)
- [ ] Find new rationalizations the agent invents; close loopholes (REFACTOR)

### When to Create

- [ ] Technique wasn't obvious; reusable across projects; agent repeatedly fails without it
- [ ] NOT for: one-off solutions, standard practices, project conventions (use CLAUDE.md), or mechanical constraints (use linters)

### Description Field

- [ ] Starts with "Use when..." — triggering conditions, not workflow
- [ ] Includes specific symptoms, error messages, synonyms
- [ ] Names tools, commands, file types that signal relevance
- [ ] Max 500 chars; under 200 for frequently-loaded skills
- [ ] Never summarizes the skill's process

### Structure

- [ ] Under 200 lines total; heavy reference docs in `references/` folder
- [ ] Frontmatter: `name` (kebab-case, verb-first) + `description`

### Writing Rules That Get Followed

- [ ] Lead with identity (one-line role), then hard constraints immediately
- [ ] Use numbered checklists gated on completion
- [ ] Name every tool and command exactly — never "appropriate" or "relevant"
- [ ] Put mandatory behaviors at the end (last section = last read before acting)
- [ ] One good/bad example pair per key concept

### Bulletproofing

- [ ] Close escape hatches: "No exceptions for 'just this once' or 'I'll do it next time'"
- [ ] Build rationalization table from RED phase — counter every excuse
- [ ] Red flags list: "If you think X, stop and follow the checklist"

### Anti-Patterns to Avoid

- [ ] No "Consider X when appropriate" — unconditional beats conditional
- [ ] No skills > 200 lines — compliance drops
- [ ] No duplicating CLAUDE.md rules
- [ ] No multi-paragraph justifications — one sentence of "why" max
- [ ] No critical rules buried in the middle — move to top or bottom
