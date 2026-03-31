---
name: gpu-performance
description: Optimize animation rendering performance with GPU acceleration. Use when fixing dropped frames, managing GPU layers, or debugging 1px shift artifacts.
---

# GPU & Performance

## when to apply

Reference these rules when:

- animations are dropping frames or feel janky
- elements shift by 1px at the start or end of animations
- deciding whether to promote elements to GPU layers
- animating blur, backdrop-filter, or filter properties
- profiling animation performance in DevTools

## rule categories by priority

| priority | category                | impact   |
| -------- | ----------------------- | -------- |
| 1        | 60fps target            | critical |
| 2        | GPU promotion           | high     |
| 3        | render isolation        | high     |
| 4        | blur and filter limits  | medium   |
| 5        | Framer Motion specifics | medium   |

## quick reference

### 1. 60fps target (critical)

- target 60fps = 16.7ms per frame budget
- only `transform` and `opacity` skip to the composite step (cheapest, GPU-accelerated)
- everything else (color, background, border, box-shadow, filter) triggers paint
- layout properties (width, height, margin, padding, top, left) trigger layout + paint + composite

### 2. GPU promotion (high)

- `will-change: transform` tells the browser to keep the element on its own GPU layer
- fixes 1px shift artifact that occurs when the browser hands off between CPU and GPU rendering at animation start/end
- apply only during active animation, not permanently — each GPU layer consumes VRAM
- `transform: translateZ(0)` forces GPU layer as a fallback for elements with expensive filter/blur
- remove `will-change` after animation completes to free the GPU layer

### 3. render isolation (high)

- `contain: layout style paint` isolates an element's rendering so changes don't cause siblings to repaint
- useful for animated elements within complex layouts — prevents cascading repaints
- apply to the animated element or its container, not broadly
- combine with `will-change` on elements that animate frequently within a session

### 4. blur and filter limits (medium)

- never animate large `blur()` or `backdrop-filter` surfaces — extremely expensive per frame
- keep blur under 20px, especially on Safari which handles blur less efficiently
- use blur only for short, one-shot effects (transition mask) not continuous animation
- prefer opacity and translate over blur when possible
- subtle `filter: blur(2px)` during fast transitions can mask intermediate frames where both states overlap

### 5. Framer Motion specifics (medium)

- Framer Motion animates outside React's render cycle — no re-renders per frame, good baseline performance
- `layoutId` shared animations can drop frames if the main thread is busy loading a new page
- fall back to CSS animations when `layoutId` transitions coincide with heavy page loads
- `useMotionValue` + `useTransform` chain stays outside React rendering — 60fps without re-renders

## common fixes

```css
/* 1px shift at animation start/end */
/* before */
.card {
  transition: transform 200ms ease-out;
}
/* after */
.card {
  transition: transform 200ms ease-out;
  will-change: transform;
}

/* cascading repaints from animated element */
/* before */
.animated {
  transition: transform 300ms ease;
}
/* after */
.animated {
  transition: transform 300ms ease;
  contain: layout style paint;
}

/* blur on large surface kills framerate */
/* before */
.overlay {
  backdrop-filter: blur(20px);
  transition: backdrop-filter 300ms;
}
/* after */
.overlay {
  opacity: 0;
  transition: opacity 200ms;
}
```

```jsx
// Framer Motion: layoutId dropping frames during page load
// before — shared layout animation stutters on navigation
<motion.div layoutId="card" />

// after — fall back to CSS for transitions during heavy loads
<div className="card-transition" />
```

## review guidance

- if animations drop frames, verify only transform/opacity are being animated
- if 1px shift occurs at start/end, add `will-change: transform`
- if `will-change` is applied globally or permanently, scope it to active animations only
- if blur or backdrop-filter is animated, verify the surface is small and the effect is one-shot
- profile with Chrome DevTools Performance panel to identify paint and layout triggers
