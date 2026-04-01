# Agent Domain Guidance

Move domain-specific testing knowledge (animation, accessibility, performance, etc.) from the outer coding agent's skill file into the inner expect agent via an on-demand MCP tool. The agent loads guidance when it needs it, not before.

---

## Problem

Domain expertise lives in sub-skill markdown files under `packages/expect-skill/` (design, performance, fixing-animation, fixing-accessibility, security-review, etc. — 8 sub-skills, ~99 files total). Currently they're loaded by the **outer coding agent** (Cursor/Claude Code) via `<important if="...">` blocks in the root `SKILL.md`. This has three problems:

1. **Wrong consumer.** The outer coding agent reads the guidance, but the inner expect agent is the one that discovers domain failures and needs the knowledge to test effectively. The guidance goes to the agent that writes code, not the one that tests it.

2. **Static routing.** The `<important if="domain=animation">` blocks are hardcoded. Adding a sub-skill requires editing the root SKILL.md. The `if` conditions duplicate info already in each sub-skill's YAML front-matter.

3. **Platform-coupled.** `<important if>` is Cursor-specific conditional rendering. In Claude Code or Codex CLI, these blocks may not evaluate correctly.

---

## Design

### New MCP tool: `load_guidance`

Add a tool to the browser MCP server (`packages/browser/src/mcp/server.ts`) that serves sub-skill content on demand.

```ts
server.registerTool(
  "load_guidance",
  {
    title: "Load Domain Guidance",
    description:
      "Load detailed testing guidance for a specific domain. Call when you encounter a domain-specific failure or need domain expertise before testing.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      domain: z.enum([
        "animation",
        "accessibility",
        "performance",
        "design",
        "security",
        "seo",
        "responsive",
        "react",
      ]),
    },
  },
  ({ domain }) => textResult(getGuidanceContent(domain)),
);
```

The agent's existing tools are read-only queries (screenshot, console_logs, network_requests, performance_metrics, accessibility_audit) plus action tools (open, playwright, close). `load_guidance` fits naturally in the read-only query category — it's the same pattern as `accessibility_audit` but for domain knowledge instead of WCAG violations.

### Prompt changes

Add a compact table of contents to the system prompt in `buildExecutionSystemPrompt()`. This costs ~10 lines of instruction budget and gives the agent enough context to know when to call the tool.

```ts
"<domain_guidance>",
"When you encounter a domain-specific failure or need expertise before testing a domain, call load_guidance:",
"- animation: springs, timing, Framer Motion, flicker, jank, enter/exit transitions",
"- accessibility: ARIA, keyboard nav, focus management, screen readers, audit rules",
"- performance: Core Web Vitals, bundle size, streaming, prefetching, resource budgets",
"- design: typography, shadows, spacing, UX psychology, container animation",
"- security: XSS, CSRF, CORS, CSP, cookies, client storage, prototype pollution",
"- seo: Open Graph, canonical URLs, structured data, metadata",
"- responsive: viewports, touch interactions, cross-browser, dark mode, layout stability",
"- react: rerenders, server components, suspense, dynamic imports, memoization",
"Call load_guidance BEFORE attempting a fix. Do not guess at domain-specific patterns.",
"</domain_guidance>",
```

### Skill content packaging

The sub-skill files need to be readable by the browser MCP server at runtime. Two options:

**Option A: Build-time bundling (recommended).** A build script reads each `*/SKILL.md` under `packages/expect-skill/` and generates a TypeScript module exporting a `Record<string, string>` mapping domain names to file content. The MCP server imports this module.

```
packages/expect-skill/
  design/SKILL.md
  performance/SKILL.md
  ...

↓ build step (codegen)

packages/browser/src/mcp/generated/guidance-content.ts
  export const GUIDANCE: Record<string, string> = {
    design: "# UI/UX Design Principles\n...",
    performance: "# Web Performance\n...",
    ...
  };
```

This keeps the source of truth as markdown files, avoids runtime filesystem access from the MCP server, and works in all deployment scenarios (npm package, bundled binary, CI).

**Option B: Runtime file reading.** The MCP server resolves the `expect-skill` package path at runtime and reads `.md` files on demand. Simpler, no build step, but requires the skill files to be installed alongside the MCP server and adds filesystem I/O.

### What happens to the outer skill

The root `packages/expect-skill/SKILL.md` drops the `<important if>` blocks entirely. The "Reference Skills" section becomes a brief note:

```markdown
## Reference Skills

Domain-specific guidance (animation, accessibility, performance, etc.) is loaded automatically
by the expect agent during test execution. You do not need to read sub-skills manually.

If `expect-cli` reports a failure with a `domain=` tag and the agent's fix guidance wasn't
sufficient, read the matching sub-skill in this directory for additional context.
```

This keeps the sub-skill files accessible to the outer coding agent as a fallback, but the primary consumer is now the inner expect agent.

---

## Domain → sub-skill mapping

| Domain enum value | Sub-skill directory      | Content                                                                 |
| ----------------- | ------------------------ | ----------------------------------------------------------------------- |
| `animation`       | `fixing-animation/`      | CSS animations, hover effects, springs, easing, Framer Motion, GPU perf |
| `accessibility`   | `fixing-accessibility/`  | ARIA patterns, keyboard nav, focus management, audit rule mapping       |
| `performance`     | `performance/`           | Core Web Vitals, bundles, streaming, prefetching, resource budgets      |
| `design`          | `design/`                | Typography, shadows, spacing, UX laws, container animation, audio       |
| `security`        | `security-review/`       | XSS, CSRF, CORS, CSP, cookies, client storage, prototype pollution      |
| `seo`             | `fixing-seo/`            | Open Graph, canonical URLs, structured data                             |
| `responsive`      | `web-design-guidelines/` | Viewports, touch, cross-browser, dark mode, font loading                |
| `react`           | `react-best-practices/`  | Rerenders, server components, suspense, dynamic imports                 |

### Sub-skill `rules/` directories

Some sub-skills have `rules/` sub-directories with deeper content (e.g., `design/rules/timing-functions.md`, `react-best-practices/rules/rerender-memo.md`). The initial implementation bundles only the top-level `SKILL.md` for each domain. Each SKILL.md already contains a table pointing to its rules, and the agent can use the summary-level guidance for most failures.

Future: add a `load_guidance_rule` tool or extend `load_guidance` with an optional `rule` parameter to load specific rules on demand. Only add this if testing shows the top-level SKILL.md isn't detailed enough for common failures.

---

## Agent workflow

1. Agent runs tests, encounters `ASSERTION_FAILED|step-04|category=app-bug; domain=animation; ...`
2. Agent calls `load_guidance({ domain: "animation" })`
3. MCP server returns the animation SKILL.md content (~280 lines)
4. Agent reads the guidance, applies the relevant patterns to diagnose the failure
5. Agent continues testing with domain knowledge in context

The guidance stays in the agent's conversation context for the rest of the session, so repeated failures in the same domain don't require re-loading.

---

## Files to change

| File                                                     | Change                                               |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `packages/browser/src/mcp/server.ts`                     | Register `load_guidance` tool                        |
| `packages/shared/src/prompts.ts`                         | Add `<domain_guidance>` TOC section to system prompt |
| `packages/expect-skill/SKILL.md`                         | Remove `<important if>` blocks, add fallback note    |
| `packages/browser/src/mcp/generated/guidance-content.ts` | New generated module (build-time codegen)            |
| `packages/expect-skill/build-guidance.ts`                | New build script for codegen                         |
| `packages/browser/tests/mcp-server.test.ts`              | Add `load_guidance` to tool list assertion, add test |
| `packages/shared/tests/prompts.test.ts`                  | Update snapshot for new `<domain_guidance>` section  |

---

## Design decisions

| Decision                              | Rationale                                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP tool over prompt injection        | Agent loads only what it needs (0-3 domains per run vs. all 8). Saves ~2000 tokens per run on average. Demand-driven > heuristic-driven.                                   |
| Compact TOC in system prompt          | Costs ~10 lines of instruction budget. Without it, the agent doesn't know the tool exists or what domains are available. The TOC is the routing table.                     |
| Build-time codegen over runtime reads | MCP server runs as a subprocess (`browser-mcp.js`). Runtime file resolution is fragile across npm installs, bundled binaries, and CI. A generated module is deterministic. |
| Top-level SKILL.md only (no rules)    | Keep initial scope small. Each SKILL.md is 100-280 lines — enough for most failures. Rules are a future expansion if testing shows gaps.                                   |
| Keep sub-skill files in expect-skill  | They remain accessible to the outer coding agent as a fallback. The outer skill just stops force-loading them.                                                             |
| `readOnlyHint` annotation             | Enables parallel tool execution in Claude Agent SDK. `load_guidance` can be called alongside `screenshot` or `console_logs` without blocking.                              |
