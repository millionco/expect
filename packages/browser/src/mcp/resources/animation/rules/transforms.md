---
name: transforms
description: Use CSS transforms correctly for animation. Use when implementing scale feedback, positioning popovers, working with transform-origin, or building 3D effects.
---

# Transforms

## when to apply

Reference these rules when:

- adding press/click feedback to buttons or interactive elements
- positioning popover or dropdown animations relative to their trigger
- combining multiple transform functions
- implementing 3D effects like card flips or depth-based layouts

## rule categories by priority

| priority | category         | impact   |
| -------- | ---------------- | -------- |
| 1        | scale feedback   | critical |
| 2        | transform origin | critical |
| 3        | transform order  | high     |
| 4        | 3D transforms    | medium   |

## quick reference

### 1. scale feedback (critical)

- use `scale(0.97)` for button press feedback — subtle enough to feel responsive without being distracting
- never animate from `scale(0)` — elements appearing from nothing feels unnatural
- always combine small scale with opacity for enter animations: `scale(0.95)` + `opacity: 0` → `scale(1)` + `opacity: 1`
- the element should always have some visible shape, like a deflated balloon inflating

### 2. transform origin (critical)

- defaults to element center, which is wrong for popovers and dropdowns
- set `transform-origin` to the trigger position so elements scale from where the user clicked/hovered
- Radix exposes `--radix-dropdown-menu-content-transform-origin` for automatic placement
- Base UI exposes `--transform-origin`
- for custom implementations, calculate origin from the trigger element's position

### 3. transform order (high)

- transform functions apply right to left (last function applies first in the coordinate space)
- `rotate(45deg) translateX(100px)` — moves along the rotated axis (diagonal)
- `translateX(100px) rotate(45deg)` — moves horizontally then rotates in place
- when combining transforms, consider which coordinate space each function should operate in

### 4. 3D transforms (medium)

- `perspective` on parent sets the depth for 3D children — smaller values = more dramatic depth
- `rotateY` for card flips, `rotateX` for vertical flips
- `translateZ` for z-axis movement (closer/farther)
- `transform-style: preserve-3d` on parent to keep children in 3D space (otherwise they flatten)
- used for card flip interactions, Sonner's stacking toast layout, depth-based parallax

## common fixes

```css
/* wrong: scaling from zero feels unnatural */
/* before */
.popover {
  transform: scale(0);
  opacity: 0;
}
.popover.open {
  transform: scale(1);
  opacity: 1;
}
/* after */
.popover {
  transform: scale(0.95);
  opacity: 0;
}
.popover.open {
  transform: scale(1);
  opacity: 1;
}

/* wrong: popover scales from center instead of trigger */
/* before */
.dropdown-content {
  transform-origin: center;
}
/* after — Radix */
.dropdown-content {
  transform-origin: var(--radix-dropdown-menu-content-transform-origin);
}
/* after — custom */
.dropdown-content {
  transform-origin: top left;
}

/* wrong: button feedback too aggressive */
/* before */
button:active {
  transform: scale(0.8);
}
/* after */
button:active {
  transform: scale(0.97);
}
```

## review guidance

- if a button has press feedback, verify it uses `scale(0.97)` — not too much, not too little
- if a popover or dropdown animates in, verify `transform-origin` is set to the trigger position
- if an element scales from invisible, verify it starts at `scale(0.95)` with `opacity: 0`, never `scale(0)`
- if multiple transforms are combined, verify the order matches the intended spatial behavior
