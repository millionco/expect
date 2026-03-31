---
name: animation-accessibility
description: Make animations accessible and handle reduced motion preferences. Use when implementing any animation that users with vestibular disorders or motion sensitivity might encounter.
---

# Accessibility

## when to apply

Reference these rules when:

- implementing any animation visible to users
- building components with animated state changes
- adding decorative motion (hover flourishes, background effects)
- managing focus after animated content transitions

## rule categories by priority

| priority | category                | impact   |
| -------- | ----------------------- | -------- |
| 1        | reduced motion          | critical |
| 2        | animation type strategy | critical |
| 3        | touch targets           | high     |
| 4        | focus management        | high     |

## quick reference

### 1. reduced motion (critical)

- respect `prefers-reduced-motion: reduce` — this is a system-level accessibility setting, not a preference
- CSS: wrap animations in `@media (prefers-reduced-motion: no-preference)` or disable in `reduce`
- JS: check `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
- Framer Motion: use `useReducedMotion()` hook
- never ignore this media query — some users experience nausea, dizziness, or seizures from motion

### 2. animation type strategy (critical)

- **decorative** (hover effects, marketing flourishes, background animations) → remove entirely under reduced motion
- **functional** (page transitions, state changes, expanding panels) → reduce duration significantly or replace with a simple fade
- **informational** (loading spinners, progress indicators, skeleton screens) → keep but simplify (reduce distance, remove bounce)
- the goal is equivalent information, not identical animation

### 3. touch targets (high)

- minimum touch target: 44x44px (Apple HIG and WCAG 2.5.5 recommendation)
- use a pseudo-element to create larger hit areas without changing visual layout
- position the pseudo-element absolutely, centered on the element, with `min-width: 44px` and `min-height: 44px`
- especially important for small icon buttons, close buttons, and toggle controls

### 4. focus management (high)

- always manage focus after animated content changes for screen reader users
- when a dialog animates in, move focus into the dialog
- when a dialog animates out, return focus to the trigger element
- don't wait for animation to complete before managing focus — screen readers don't see animation
- animated content that changes meaning (tabs, accordion) should announce the change via `aria-live` or focus shift

## common fixes

```css
/* remove decorative animations under reduced motion */
@media (prefers-reduced-motion: reduce) {
  .decorative-animation {
    animation: none;
    transition: none;
  }
}

/* replace functional animation with fade under reduced motion */
@media (prefers-reduced-motion: reduce) {
  .page-transition {
    animation: none;
    transition: opacity 100ms ease;
  }
}

/* enlarge touch target without changing layout */
.icon-button {
  position: relative;
}
.icon-button::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-width: 44px;
  min-height: 44px;
  width: 100%;
  height: 100%;
}
```

```jsx
// Framer Motion: respect reduced motion
import { useReducedMotion } from "motion/react";

const shouldReduce = useReducedMotion();
<motion.div animate={{ x: 0 }} transition={shouldReduce ? { duration: 0 } : { type: "spring" }} />;
```

## review guidance

- if any animation exists, verify `prefers-reduced-motion` is handled
- categorize each animation (decorative, functional, informational) and apply the correct reduction strategy
- if small interactive elements exist (<44px), verify touch target sizing
- if animated content changes (dialog open, tab switch, accordion expand), verify focus is managed
