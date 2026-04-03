---
name: easing
description: Select the correct easing curve for UI animations. Use when choosing timing functions for transitions, enter/exit animations, or on-screen movement.
---

# Easing

## when to apply

Reference these rules when:

- choosing a timing function for any CSS transition or animation
- implementing enter/exit animations for dropdowns, toasts, dialogs, popovers
- animating elements that are already visible and need to reposition
- deciding between built-in and custom cubic-bezier curves

## rule categories by priority

| priority | category                  | impact   |
| -------- | ------------------------- | -------- |
| 1        | enter and exit easing     | critical |
| 2        | on-screen movement easing | critical |
| 3        | forbidden easing          | high     |
| 4        | custom curves             | medium   |

## quick reference

### 1. enter and exit easing (critical)

- use `ease-out` for all elements entering or exiting the screen
- ease-out starts fast (feels responsive) and decelerates into final position
- applies to: dropdowns, toasts, dialogs, popovers, tooltips, menus, notifications
- the fast start is what makes the UI feel like it reacted instantly to the user's action

### 2. on-screen movement easing (critical)

- use `ease-in-out` for elements already visible that need to move or resize
- mimics natural acceleration/deceleration like a car starting and stopping
- applies to: morphing containers, sliding panels, expanding sections, Dynamic Island-style size changes
- `ease` is a softer variant — acceptable for subtle color transitions or gentle components

### 3. forbidden easing (high)

- never use `ease-in` for UI animations — starts slow, feels sluggish and unresponsive
- same duration with `ease-in` feels slower than `ease-out` because movement is back-loaded
- `linear` is wrong for almost all UI motion — only correct for progress bars and continuous rotation

### 4. custom curves (medium)

- built-in CSS easing curves lack energy for noticeable animations
- use custom `cubic-bezier` curves for intentional, snappy motion
- default snappy product easing: `cubic-bezier(0.32, 0.72, 0, 1)` — sharp start, subtle deceleration
- reference [easings.co](https://easings.co/) for curve visualization
- the built-in `ease-out` is acceptable for very subtle transitions but too weak for prominent ones

## common fixes

```css
/* wrong: ease-in feels sluggish on enter */
/* before */
.dropdown {
  transition: opacity 200ms ease-in;
}
/* after */
.dropdown {
  transition: opacity 200ms ease-out;
}

/* wrong: linear on UI motion feels robotic */
/* before */
.panel {
  transition: transform 300ms linear;
}
/* after */
.panel {
  transition: transform 300ms ease-in-out;
}

/* weak: built-in ease-out lacks energy on prominent animations */
/* before */
.modal {
  transition: transform 200ms ease-out;
}
/* after */
.modal {
  transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1);
}
```

## review guidance

- if the element is entering or leaving, it must use ease-out or a custom curve with fast start
- if the element is already visible and repositioning, it must use ease-in-out
- if an animation feels sluggish, check for ease-in or linear first
- for prominent animations (modals, drawers, page transitions), prefer a custom curve over built-in ease-out
