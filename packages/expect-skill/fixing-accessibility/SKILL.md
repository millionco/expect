---
name: fixing-accessibility
description: Use when adding or changing buttons, links, inputs, menus, dialogs, tabs, dropdowns, forms, keyboard shortcuts, focus states, or icon-only controls. Also use when fixing violations from accessibility_audit tool output. Covers WCAG 2.1 AA, ARIA, semantic HTML, keyboard navigation, contrast, screen reader support.
---

# Fixing Accessibility

You are fixing accessibility issues against WCAG 2.1 AA. Use native HTML before ARIA. Make minimal, targeted fixes — do not refactor unrelated code.

## Rules

### 1. Accessible Names (Critical — WCAG 1.1.1, 4.1.2)

- Every interactive control must have an accessible name
- Icon-only buttons must have `aria-label` or `aria-labelledby`
- Every `<input>`, `<select>`, `<textarea>` must have `<label>` or `aria-label`
- Links must have meaningful text — never "click here" or "read more"
- Decorative icons and images must use `aria-hidden="true"` or `alt=""`
- Do not add `aria-label` to elements that already have visible text

### 2. Keyboard Access (Critical — WCAG 2.1.1, 2.4.3, 2.4.7, 2.5.5)

- All interactive elements must be reachable by Tab / Shift+Tab
- Buttons must activate with Enter and Space
- Lists and menus must navigate with Arrow keys
- Escape must close dialogs, dropdowns, and overlays
- Touch targets should be at least 44x44 CSS pixels (recommended)
- Never use `<div>` or `<span>` as buttons — use `<button>`
- Never use `tabindex` > 0
- Never use `outline: none` without a visible replacement

### 3. Focus and Dialogs (Critical — WCAG 2.4.3)

- Modals must trap focus — Tab cycles within the dialog
- Restore focus to the trigger element on close
- Set initial focus inside dialogs
- SPAs must manage focus on route changes

### 4. Semantics (High — WCAG 1.3.1, 4.1.2)

- Use native elements (`<button>`, `<a>`, `<input>`) — not ARIA role hacks
- If a role is used, all required ARIA attributes must be present
- Do not skip heading levels
- Use landmark elements: `<header>`, `<nav>`, `<main>`, `<footer>`

### 5. Forms and Errors (High — WCAG 3.3.1, 3.3.2)

- Errors must be linked to fields via `aria-describedby` and use `role="alert"`
- Required fields must use `aria-required="true"` or `required`
- Invalid fields must set `aria-invalid="true"`
- Never use `placeholder` as a substitute for `<label>`

### 6. Announcements (Medium — WCAG 4.1.3)

- Errors: `aria-live="assertive"` for immediate reading
- Status updates: `aria-live="polite"`
- Loading states: `aria-busy="true"`
- Expandable controls: `aria-expanded` + `aria-controls`

### 7. Contrast (Medium — WCAG 1.4.3, 1.4.11)

- Normal text: >= 4.5:1
- Large text (18px+ bold or 24px+): >= 3:1
- UI components and focus indicators: >= 3:1
- Never convey information by color alone

## Before/After Fixes

```html
<!-- BAD: icon-only button with no name -->
<button><svg>...</svg></button>
<!-- GOOD -->
<button aria-label="Close"><svg aria-hidden="true">...</svg></button>

<!-- BAD: div as button -->
<div onclick="save()">Save</div>
<!-- GOOD -->
<button onclick="save()">Save</button>

<!-- BAD: input with no label -->
<input type="text" placeholder="Search" />
<!-- GOOD -->
<label for="search" class="sr-only">Search</label>
<input id="search" type="text" placeholder="Search" />

<!-- BAD: error not linked to field -->
<input id="email" /> <span>Invalid email</span>
<!-- GOOD -->
<input id="email" aria-describedby="email-err" aria-invalid="true" />
<span id="email-err" role="alert">Invalid email</span>

<!-- BAD: outline removed -->
<style>button:focus { outline: none; }</style>
<!-- GOOD -->
<style>button:focus-visible { outline: 3px solid #0066cc; outline-offset: 2px; }</style>
```

## Interpreting `accessibility_audit` Output

The `accessibility_audit` tool runs axe-core + IBM Equal Access and returns violations sorted by severity. Each violation has: `impact` (critical > serious > moderate > minor), `ruleId`, `description`, `helpUrl`, `wcagTags`, and `nodes[]` with `selector`, `html`, `failureSummary`.

1. Fix `critical` and `serious` first — these block users
2. Group violations by `ruleId` — one fix often resolves multiple nodes
3. Use `nodes[].selector` to locate the element, `nodes[].html` to confirm the component
4. Apply the fix from `nodes[].failureSummary` or the lookup table in `rules/audit-rule-mapping.md`
5. Prefer native HTML over ARIA when both solve the problem
6. Re-run `accessibility_audit` after fixing to confirm resolution

For complex widgets (dialog, combobox, menu, tabs), read `rules/patterns.md` before writing custom implementations.

## Red Flags

If you catch yourself thinking any of these, stop and re-read the rules:

| You Think | The Rule |
| --- | --- |
| "I'll add `role='button'` to this div" | Use `<button>`. Native elements over ARIA roles. |
| "This is just a visual change, a11y doesn't apply" | Every UI change can break accessibility. Check. |
| "I'll add `aria-label` to this link that already has text" | Redundant ARIA overrides visible text for screen readers. Don't. |
| "outline: none looks cleaner" | You just made the control invisible to keyboard users. |
| "placeholder is basically a label" | It disappears on input and is not announced reliably. Use `<label>`. |
| "I'll skip re-running the audit, the fix is obvious" | Re-run `accessibility_audit`. Always. |
| "tabindex='5' will fix the focus order" | Never use `tabindex` > 0. Fix the DOM order instead. |

## Review Checklist

When reviewing or fixing accessibility, you MUST:

1. Apply the rules above to every interactive element you touch
2. Use native HTML before adding ARIA
3. Re-run `accessibility_audit` after fixing to verify resolution
4. Quote the exact failing snippet and cite the WCAG criterion when reporting

Do not skip any step. Do not add ARIA when native semantics solve the problem. Do not refactor unrelated code. No exceptions for "it's a small change", "I already checked manually", or "I'll fix it later."
