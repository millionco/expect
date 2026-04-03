---
name: fixing-animation
description: >
  CSS and UI animation patterns, performance, and accessibility. Use when implementing hover effects,
  tooltips, button feedback, transitions, scroll-linked motion, or fixing animation issues like
  flicker, shakiness, and jank. Covers practical patterns, rendering performance, Framer Motion,
  easing, timing, and accessibility.
version: 1.0.0
---

# Animation Patterns & Performance

Fetch `expect://rules/animation/<sub-rule>` for detailed guides.

## Checklist

- [ ] Animate only GPU-friendly properties: `transform` and `opacity`
- [ ] Never animate layout properties (width, height, top, left) on large surfaces
- [ ] UI animations complete within 300ms; snappy easing: `cubic-bezier(0.32, 0.72, 0, 1)`
- [ ] Use `ease-out` for enter/exit; `ease-in-out` for on-screen movement
- [ ] Don't animate from `scale(0)` — start from `scale(0.95)` + `opacity: 0`
- [ ] Scale buttons on press: `transform: scale(0.97)` on `:active`
- [ ] Use `will-change: transform` only during active interaction, not permanently
- [ ] Animate child elements to fix hover flicker, not the hovered element itself
- [ ] Disable hover effects on touch: `@media (hover: hover) and (pointer: fine)`
- [ ] Skip animation on subsequent tooltips while one is open (`data-instant`)
- [ ] Popovers scale from trigger: use `transform-origin: var(--transform-origin)`
- [ ] Don't animate keyboard interactions (arrow keys, shortcuts, tab/focus)
- [ ] Honor `prefers-reduced-motion`: remove decorative, reduce functional animations
- [ ] Never interleave layout reads and writes in the same frame
- [ ] No `requestAnimationFrame` loops without a stop condition
- [ ] Use Scroll/View Timelines for scroll-linked motion, not scroll event polling
- [ ] Pause/stop off-screen animations via IntersectionObserver
- [ ] Keep blur animations <= 8px; never animate blur continuously on large surfaces
- [ ] Use `will-change` temporarily and surgically; avoid many/large promoted layers
- [ ] Do not migrate animation libraries unless explicitly requested

## Sub-Rules

- `expect://rules/animation/accessibility`
- `expect://rules/animation/consistency`
- `expect://rules/animation/easing`
- `expect://rules/animation/enter-exit`
- `expect://rules/animation/framer-motion`
- `expect://rules/animation/gpu-performance`
- `expect://rules/animation/hover`
- `expect://rules/animation/properties`
- `expect://rules/animation/springs`
- `expect://rules/animation/timing`
- `expect://rules/animation/transforms`
