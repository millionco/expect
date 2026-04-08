---

## name: responsive

description: >
Responsive design patterns for websites and web apps. Use when building responsive layouts,
fixing mobile issues, adding breakpoints, working with sticky/scroll patterns, or when
dealing with viewport, adaptive design, or mobile-first CSS.
version: 1.0.0

# Responsive Design

## Checklist

### Escalation Model

- Intrinsic CSS first (`auto-fit`, `flex-wrap`, `clamp()`) before container queries or media queries
- Container queries for component-level adaptation (cards, nav items)
- Media queries only for page-level structural shifts (grid columns, nav transform, sidebar)
- `clamp()` for fluid typography, spacing, and sizing — avoid hard breakpoints for these

### Common Failures

- Use `svh`/`dvh` with `vh` fallback — `100vh` overflows behind mobile browser chrome
- Always `min-width` (mobile-first) media queries, not `max-width` (desktop-first)
- Add `min-width: 0` on flex children with dynamic content — prevents overflow
- `overflow: hidden` kills sticky — use `overflow: clip` for visual clipping instead
- `transform` on ancestor breaks `position: fixed` — children become relative to that ancestor
- Input `font-size` must be `max(16px, 1rem)` — below 16px triggers Safari viewport zoom
- Add `env(safe-area-inset-*)` for notched devices — requires `viewport-fit=cover` in meta tag
- Use `isolation: isolate` + tiered z-index scale — never `z-index: 9999`
- Add `align-self: start` on sticky elements in flex/grid — prevents stretch breaking sticky
- Test by dragging from 280px to 2560px, not just jumping between named breakpoints

### Design Forks

- When a responsive translation has multiple valid approaches, present 2-3 options with tradeoffs
- Don't default silently — ask the user to choose between valid layout strategies

### Sticky & Scroll

- Check all overflow ancestors before adding sticky — any `overflow: hidden/scroll/auto` breaks it
- Sticky in flex/grid needs `align-self: start` — the #1 silent sticky failure
- Use scroll-snap for carousel/paging patterns
- Pause/stop off-screen animations via IntersectionObserver

## Sub-Rules

- `expect://rules/responsive/ai-failure-patterns`
- `expect://rules/responsive/modern-css-patterns`
- `expect://rules/responsive/responsive-design-forks`
- `expect://rules/responsive/sticky-scroll-patterns`
- `expect://rules/responsive/testing-checklist`
