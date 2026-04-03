---
name: hover
description: Implement hover animations without flicker or touch device issues. Use when adding hover effects to cards, buttons, links, or any interactive element.
---

# Hover

## when to apply

Reference these rules when:

- adding hover effects that move, scale, or transform elements
- hover states are flickering or jittering
- implementing hover interactions thatmust work across desktop and mobile
- debouncing hover on elements with many adjacent triggers

## rule categories by priority

| priority | category               | impact   |
| -------- | ---------------------- | -------- |
| 1        | flicker prevention     | critical |
| 2        | touch device handling  | critical |
| 3        | hover debounce         | high     |
| 4        | mobile two-tap pattern | medium   |

## quick reference

### 1. flicker prevention (critical)

- when a hover animation moves an element, the cursor may leave the element's bounds, un-triggering hover, causing infinite flicker
- fix: animate a child element instead of the hovered element itself
- the parent's hover area stays stable while the child moves visually
- this applies to any transform that changes the element's visual position: translateY, translateX, scale, rotate

### 2. touch device handling (critical)

- touch devices don't have true hover — finger movement triggers unwanted hover states
- wrap all hover styles in `@media (hover: hover) and (pointer: fine)` to restrict to mouse/trackpad
- Tailwind v4's `hover:` modifier automatically applies only when the device supports hover
- never rely on hover as the only way to access information or functionality

### 3. hover debounce (high)

- fast mouse movement across many adjacent hoverable elements (nav items, icon grids) triggers rapid hover/unhover cycles
- wrap hover handlers in a 100ms timeout (useHoverTimeout pattern) to prevent jittery triggers
- clear the timeout on mouse leave so only sustained hovers trigger the animation
- especially important when hover triggers expensive operations (data fetching, complex animations)

### 4. mobile two-tap pattern (medium)

- on touch devices with no hover, use a two-tap pattern: first tap triggers hover animation, second tap triggers click
- shared hook (`useTapState`) tracks readiness across components
- set hover delay to 0ms on mobile since there's no mouse movement to debounce
- provides the same visual feedback flow as desktop but adapted for touch input

## common fixes

```css
/* flicker: hover moves the element, cursor leaves, hover un-triggers */
/* before — parent moves on hover, causes flicker */
.card:hover {
  transform: translateY(-8px);
}

/* after — animate child, parent hover area stays stable */
.card:hover .card-inner {
  transform: translateY(-8px);
}
.card-inner {
  transition: transform 200ms ease;
}

/* hover fires on touch devices */
/* before */
.button:hover {
  background: var(--hover-bg);
}
/* after */
@media (hover: hover) and (pointer: fine) {
  .button:hover {
    background: var(--hover-bg);
  }
}
```

```jsx
// hover debounce for adjacent elements
// before — jittery hover on fast mouse movement
const handleHover = () => setActive(true);

// after — debounced hover
const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
const handleHover = () => {
  timeoutRef.current = setTimeout(() => setActive(true), 100);
};
const handleLeave = () => {
  clearTimeout(timeoutRef.current);
  setActive(false);
};
```

## review guidance

- if a hover effect flickers, check whether the hovered element itself is being transformed — move the transform to a child
- if hover styles appear on mobile/touch, wrap in `@media (hover: hover) and (pointer: fine)`
- if hover on adjacent elements feels jittery, add a 100ms debounce
- if hover is the only way to access content or actions, add a touch-accessible alternative
