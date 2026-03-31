---
name: springs
description: Use spring-based animations correctly. Use when choosing between springs and CSS transitions, implementing drag interactions, or handling animation interruption.
---

# Springs

## when to apply

Reference these rules when:

- choosing between spring and CSS transition for an animation
- implementing drag, throw, or gesture-driven interactions
- handling cases where animations can be interrupted mid-flight
- configuring stiffness, damping, and mass for spring physics

## rule categories by priority

| priority | category               | impact   |
| -------- | ---------------------- | -------- |
| 1        | when to use springs    | critical |
| 2        | bounce defaults        | critical |
| 3        | spring parameters      | high     |
| 4        | when CSS is acceptable | medium   |

## quick reference

### 1. when to use springs (critical)

- use springs when animations can be interrupted — user hovers on/off quickly, toggles state rapidly, drags and releases
- springs redirect momentum smoothly without jumps or restarts when a new target is set mid-animation
- CSS transitions snap to new values on interrupt, causing visible jumps
- springs have no fixed duration — they settle naturally based on physics, which feels more organic
- Framer Motion defaults to spring for physical properties (x, y, scale, rotate)

### 2. bounce defaults (critical)

- no-bounce must be the default for product UI — bounce on buttons, menus, and dialogs feels unprofessional
- slight bounce is acceptable only for drag gestures where the user applies physical force (dragging a drawer, throwing an item)
- Vaul (drawer library) intentionally chose CSS over springs to minimize bundle size — valid trade-off for size-sensitive projects
- when in doubt, zero bounce. Add bounce only after testing and confirming it matches the interaction's physicality

### 3. spring parameters (high)

- **stiffness** — spring rigidity. Higher = faster, snappier. Lower = gentle, slower. Start around 300 for snappy UI
- **damping** — oscillation decay. Higher = settles quickly (no bounce). Lower = more oscillation. Start around 20-30 for no-bounce
- **mass** — element weight. Higher = heavier, slower to start and stop. Keep at 1 unless simulating heavy objects
- common chain in Framer Motion: `useMotionValue` (raw input) → `useTransform` (maps ranges) → `useSpring` (smooths output)

### 4. when CSS is acceptable (medium)

- simple hover/active effects that don't get interrupted
- enter/exit transitions that always complete (toast appearing, dialog opening)
- infinite loops (spinner, marquee, skeleton pulse)
- bundle-size-sensitive projects where spring library cost isn't justified
- CSS transitions are hardware-accelerated for transform/opacity and stay smooth even when main thread is busy

## common fixes

```jsx
/* wrong: CSS transition jumps on interrupt */
/* before — user rapidly hovers on/off, animation jumps */
<div style={{ transition: 'transform 300ms ease-out' }} />

/* after — spring smoothly redirects on interrupt */
<motion.div
  whileHover={{ scale: 1.05 }}
  transition={{ type: "spring", stiffness: 300, damping: 20 }}
/>

/* wrong: bounce on a dropdown menu */
/* before */
<motion.div animate={{ y: 0 }} transition={{ type: "spring", bounce: 0.3 }} />
/* after */
<motion.div animate={{ y: 0 }} transition={{ type: "spring", bounce: 0 }} />

/* wrong: spring on a simple opacity fade (unnecessary) */
/* before */
<motion.div animate={{ opacity: 1 }} transition={{ type: "spring" }} />
/* after — CSS or tween is fine for opacity */
<motion.div animate={{ opacity: 1 }} transition={{ duration: 0.15 }} />
```

## review guidance

- if the animation can be interrupted (hover, toggle, drag), prefer a spring over CSS transition
- if a spring has visible bounce on a standard UI element (menu, dialog, button), set bounce to 0
- if the animation is a simple opacity fade or color change, springs are unnecessary — use tween or CSS
- if bundle size is a concern and interruption handling isn't needed, CSS transitions are acceptable
