---
name: fixing-accessibility
description: Use when adding or changing buttons, links, inputs, menus, dialogs, tabs, dropdowns, forms, keyboard shortcuts, focus states, or icon-only controls. Also use when fixing violations from accessibility_audit tool output. Covers WCAG 2.1 AA, ARIA, semantic HTML, keyboard navigation, contrast, screen reader support.
---

# Fixing Accessibility

Use native HTML before ARIA. Make minimal, targeted fixes — do not refactor unrelated code.

## Checklist

- [ ] Every interactive control has an accessible name (aria-label, label, or visible text)
- [ ] Icon-only buttons have `aria-label`; decorative icons have `aria-hidden="true"`
- [ ] Every input/select/textarea has a `<label>` or `aria-label` — never placeholder-only
- [ ] Links have meaningful text — never "click here" or "read more"
- [ ] All interactive elements reachable by Tab/Shift+Tab
- [ ] Buttons activate with Enter and Space; lists/menus navigate with Arrow keys
- [ ] Escape closes dialogs, dropdowns, and overlays
- [ ] Touch targets at least 44x44 CSS pixels
- [ ] Never use `<div>`/`<span>` as buttons — use `<button>`
- [ ] Never use `tabindex` > 0; never `outline: none` without visible replacement
- [ ] Modals trap focus; restore focus to trigger on close
- [ ] SPAs manage focus on route changes
- [ ] Use native elements before ARIA roles; do not skip heading levels
- [ ] Use landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`
- [ ] Errors linked to fields via `aria-describedby` + `role="alert"`
- [ ] Required fields use `aria-required="true"` or `required`; invalid fields set `aria-invalid="true"`
- [ ] Status: `aria-live="polite"`; errors: `aria-live="assertive"`; loading: `aria-busy="true"`
- [ ] Expandable controls use `aria-expanded` + `aria-controls`
- [ ] Text contrast >= 4.5:1 (normal) or >= 3:1 (large text/UI components)
- [ ] Never convey information by color alone
- [ ] Re-run `accessibility_audit` after every fix

## Sub-Rules

- `expect://rules/accessibility/audit-rule-mapping`
- `expect://rules/accessibility/patterns`
