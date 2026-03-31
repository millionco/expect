---
name: enter-exit
description: Animate elements entering and exiting the DOM correctly. Use when implementing dialogs, popovers, tooltips, toasts, dropdown menus, or any element that appears and disappears.
---

# Enter & Exit

## when to apply

Reference these rules when:

- implementing dialogs, modals, or drawers that animate in/out
- building tooltips, popovers, or dropdown menus
- adding toast or notification animations
- working with AnimatePresence in Framer Motion
- staggering multiple elements appearing together

## rule categories by priority

| priority | category                  | impact   |
| -------- | ------------------------- | -------- |
| 1        | fill mode for persistence | critical |
| 2        | tooltip sequencing        | critical |
| 3        | direction awareness       | high     |
| 4        | stagger timing            | medium   |
| 5        | AnimatePresence           | high     |

## quick reference

### 1. fill mode for persistence (critical)

- use `animation-fill-mode: forwards` for elements that animate in and stay (dialogs, popovers)
- without `forwards`, the element snaps back to its pre-animation state after the keyframe completes
- for CSS transitions this isn't needed — the element stays at the transitioned value while the triggering condition holds

### 2. tooltip sequencing (critical)

- first tooltip: show with delay + animation (user discovers the feature)
- subsequent tooltips while one is already open: instant appearance, no delay, no animation
- Radix UI and Base UI support this with a `data-instant` attribute
- set `transition-duration: 0ms` when `[data-instant]` is present

### 3. direction awareness (high)

- animations should originate from the spatial context of the user's action
- dropdown from a top-nav button: animate downward from that button
- dropdown from a bottom toolbar: animate upward
- tab content switching: slide in the direction the user navigated (left tab → right tab = content slides left)
- modal from a card: expand from the card's position, not from screen center

### 4. stagger timing (medium)

- stagger child elements with `50–100ms` sequential delays
- creates rhythm, guides the eye through content hierarchy
- too fast (<30ms) looks simultaneous — too slow (>150ms) feels sluggish
- in Framer Motion, use parent variants with `staggerChildren: 0.05` to `staggerChildren: 0.1`
- only stagger on first appearance — don't re-stagger on every state change

### 5. AnimatePresence (high)

- every child inside `AnimatePresence` must have a unique `key` — without it, exit animations won't trigger
- `mode="wait"` — old element exits completely before new enters (wizard steps, content crossfades)
- `mode="popLayout"` — simultaneous exit and enter, old element removed from flow immediately
- `initial={false}` on AnimatePresence prevents mount animation — useful when only exit/enter on state change matters, not first render
- use `popLayout` carefully — can cause visual glitches with absolutely positioned content

## common fixes

```css
/* dialog snaps back after animation completes */
/* before */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.dialog {
  animation: fadeIn 200ms ease-out;
}
/* after */
.dialog {
  animation: fadeIn 200ms ease-out forwards;
}

/* subsequent tooltips animate when they should be instant */
/* before */
.tooltip {
  transition:
    opacity 125ms ease-out,
    transform 125ms ease-out;
}
/* after */
.tooltip {
  transition:
    opacity 125ms ease-out,
    transform 125ms ease-out;
}
.tooltip[data-instant] {
  transition-duration: 0ms;
}
```

```jsx
// exit animation doesn't fire — missing key
// before
<AnimatePresence>
  {isOpen && <motion.div exit={{ opacity: 0 }} />}
</AnimatePresence>
// after
<AnimatePresence>
  {isOpen && <motion.div key="modal" exit={{ opacity: 0 }} />}
</AnimatePresence>

// mount animation fires unnecessarily on first render
// before
<AnimatePresence>
  <motion.div key={step} initial={{ x: 100 }} animate={{ x: 0 }} exit={{ x: -100 }} />
</AnimatePresence>
// after — no animation on initial mount
<AnimatePresence initial={false}>
  <motion.div key={step} initial={{ x: 100 }} animate={{ x: 0 }} exit={{ x: -100 }} />
</AnimatePresence>
```

## review guidance

- if a CSS keyframe animation resets after completing, add `animation-fill-mode: forwards`
- if tooltips animate when switching between adjacent triggers, check for instant/sequential tooltip handling
- if content transitions feel spatially wrong, check that animation direction matches navigation direction
- if AnimatePresence exit doesn't fire, verify every child has a unique `key` prop
