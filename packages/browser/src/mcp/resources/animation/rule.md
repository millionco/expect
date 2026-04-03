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

Practical animation reference and performance rules. See `rules/` for detailed guides on specific topics.

## Rules

| Rule            | File                       | When to apply                                        |
| --------------- | -------------------------- | ---------------------------------------------------- |
| Accessibility   | `rules/accessibility.md`   | Reduced motion, touch targets, focus management      |
| Consistency     | `rules/consistency.md`     | Uniform animation language, motion tokens            |
| Easing          | `rules/easing.md`          | Enter/exit easing, on-screen movement, custom curves |
| Enter & Exit    | `rules/enter-exit.md`      | Fill mode, tooltip sequencing, stagger timing        |
| Framer Motion   | `rules/framer-motion.md`   | layout/layoutId, AnimatePresence, variants, gestures |
| GPU Performance | `rules/gpu-performance.md` | 60fps, GPU promotion, render isolation, blur limits  |
| Hover           | `rules/hover.md`           | Flicker prevention, touch devices, hover debounce    |
| Properties      | `rules/properties.md`      | Compositor-only properties, forbidden layout props   |
| Springs         | `rules/springs.md`         | When to use springs, bounce defaults, parameters     |
| Timing          | `rules/timing.md`          | Interaction feedback, content transitions, frequency |
| Transforms      | `rules/transforms.md`      | Scale feedback, transform origin, 3D transforms      |

## Recording & Debugging

### Record Your Animations

When something feels off but you can't identify why, record the animation and play it back frame by frame. This reveals details invisible at normal speed.

### Fix Shaky Animations

Elements may shift by 1px at the start/end of CSS transform animations due to GPU/CPU rendering handoff.

**Fix:**

```css
.element:hover,
.element:active {
  will-change: transform;
}
```

This tells the browser to promote the element to a GPU layer during interaction, avoiding the CPU/GPU handoff shift. Only apply `will-change` during active animation — permanent use wastes VRAM.

## Button & Click Feedback

### Scale Buttons on Press

Make interfaces feel responsive by adding subtle scale feedback:

```css
button:active {
  transform: scale(0.97);
}
```

### Don't Animate from scale(0)

Starting from `scale(0)` makes elements appear from nowhere—it feels unnatural.

**Good:**

```css
.element {
  transform: scale(0.95);
  opacity: 0;
}
.element.visible {
  transform: scale(1);
  opacity: 1;
}
```

## Tooltips & Popovers

### Skip Animation on Subsequent Tooltips

First tooltip: delay + animation. Subsequent tooltips (while one is open): instant, no delay.

```css
.tooltip {
  transition:
    transform 125ms ease-out,
    opacity 125ms ease-out;
  transform-origin: var(--transform-origin);
}

.tooltip[data-starting-style],
.tooltip[data-ending-style] {
  opacity: 0;
  transform: scale(0.97);
}

/* Skip animation for subsequent tooltips */
.tooltip[data-instant] {
  transition-duration: 0ms;
}
```

### Make Animations Origin-Aware

Popovers should scale from their trigger, not from center.

```css
.popover {
  transform-origin: var(--transform-origin);
}
```

## Speed & Timing

- UI animations should stay under 300ms. Snappy easing curve: `cubic-bezier(0.32, 0.72, 0, 1)`.
- Don't animate keyboard interactions (arrow keys, shortcuts, tab/focus movements).
- Be careful with frequently-used elements — use your product daily to find annoying animations.

## Hover States

### Fix Hover Flicker

Animate a child element instead of the hovered element:

```css
.box:hover .box-inner {
  transform: translateY(-20%);
}
.box-inner {
  transition: transform 200ms ease;
}
```

### Disable Hover on Touch Devices

```css
@media (hover: hover) and (pointer: fine) {
  .card:hover {
    transform: scale(1.05);
  }
}
```

## Easing Selection

- **Enter/Exit:** `ease-out` — fast start creates responsiveness
- **On-screen movement:** `ease-in-out` — mimics natural acceleration/deceleration
- **Custom curves:** Built-in CSS curves are usually too weak. See [easings.co](https://easings.co/)

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .animated-element {
    animation: none;
    transition: none;
  }
}
```

**Strategy:** Remove decorative animations. Reduce or replace functional animations (swap slide for fade).

## Performance Rules

### Rendering steps glossary

- **composite:** transform, opacity
- **paint:** color, borders, gradients, masks, images, filters
- **layout:** size, position, flow, grid, flex

### Performance rule categories by priority

| priority | category             | impact      |
| -------- | -------------------- | ----------- |
| 1        | never patterns       | critical    |
| 2        | choose the mechanism | critical    |
| 3        | measurement          | high        |
| 4        | scroll               | high        |
| 5        | paint                | medium-high |
| 6        | layers               | medium      |
| 7        | blur and filters     | medium      |
| 8        | view transitions     | low         |

### 1. never patterns (critical)

- do not interleave layout reads and writes in the same frame
- do not animate layout continuously on large or meaningful surfaces
- do not drive animation from scrollTop, scrollY, or scroll events
- no requestAnimationFrame loops without a stop condition
- do not mix multiple animation systems that each measure or mutate layout

### 2. choose the mechanism (critical)

- default to transform and opacity for motion
- use JS-driven animation only when interaction requires it
- paint or layout animation is acceptable only on small, isolated surfaces
- one-shot effects are acceptable more often than continuous motion
- prefer downgrading technique over removing motion entirely

### 3. measurement (high)

- measure once, then animate via transform or opacity
- batch all DOM reads before writes
- do not read layout repeatedly during an animation
- prefer FLIP-style transitions for layout-like effects

### 4. scroll (high)

- prefer Scroll or View Timelines for scroll-linked motion when available
- use IntersectionObserver for visibility and pausing
- do not poll scroll position for animation
- pause or stop animations when off-screen

### 5. paint (medium-high)

- paint-triggering animation is allowed only on small, isolated elements
- do not animate paint-heavy properties on large containers
- do not animate CSS variables for transform, opacity, or position
- scope animated CSS variables locally and avoid inheritance

### 6. layers (medium)

- compositor motion requires layer promotion, never assume it
- use will-change temporarily and surgically
- avoid many or large promoted layers
- validate layer behavior with tooling when performance matters

### 7. blur and filters (medium)

- keep blur animation small (<=8px)
- use blur only for short, one-time effects
- never animate blur continuously or on large surfaces
- prefer opacity and translate before blur

### 8. view transitions (low)

- use view transitions only for navigation-level changes
- avoid view transitions for interaction-heavy UI
- treat size changes as potentially layout-triggering

## Common Performance Fixes

```css
/* layout thrashing: animate transform instead of width */
/* before */
.panel {
  transition: width 0.3s;
}
/* after */
.panel {
  transition: transform 0.3s;
}

/* scroll-linked: use scroll-timeline instead of JS */
.reveal {
  animation: fade-in linear;
  animation-timeline: view();
}
```

```js
// measurement: batch reads before writes (FLIP)
const first = el.getBoundingClientRect();
el.classList.add("moved");
const last = el.getBoundingClientRect();
el.style.transform = `translateX(${first.left - last.left}px)`;
requestAnimationFrame(() => {
  el.style.transition = "transform 0.3s";
  el.style.transform = "";
});
```

## Tool Boundaries

- do not migrate or rewrite animation libraries unless explicitly requested
- apply rules within the existing animation system
- prefer minimal changes, do not refactor unrelated code
