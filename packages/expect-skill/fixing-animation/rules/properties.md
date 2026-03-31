---
name: animatable-properties
description: Choose which CSS properties to animate for 60fps performance. Use when deciding what to animate, fixing janky animations, or optimizing rendering performance.
---

# Animatable Properties

## when to apply

Reference these rules when:

- choosing which CSS property to animate for a transition or keyframe
- debugging janky or dropped-frame animations
- replacing layout-triggering animations with compositor-friendly alternatives
- implementing reveal animations, size changes, or position changes

## rendering pipeline

Style → Layout → Paint → Composite. Each step is more expensive than the next.

- **composite** (cheapest, GPU): `transform`, `opacity`
- **paint**: `color`, `background`, `border-color`, `box-shadow`, `filter`
- **layout** (most expensive): `width`, `height`, `margin`, `padding`, `top`, `left`, `right`, `bottom`

## rule categories by priority

| priority | category                    | impact   |
| -------- | --------------------------- | -------- |
| 1        | compositor-only properties  | critical |
| 2        | forbidden layout properties | critical |
| 3        | transition shorthand        | high     |
| 4        | clip-path as alternative    | medium   |

## quick reference

### 1. compositor-only properties (critical)

- default to `transform` and `opacity` for all animation
- these skip layout and paint, run on the GPU at 60fps
- use `translate` for position, `scale` for size perception, `rotate` for rotation
- opacity handles fade in/out, visibility changes, crossfades

### 2. forbidden layout properties (critical)

- never animate `width`, `height`, `margin`, `padding` — triggers layout recalculation every frame
- never animate `top`, `left`, `right`, `bottom` — triggers layout recalculation every frame
- these force the browser to recalculate positions of all surrounding elements per frame
- use `transform: translateX/Y` instead of `top/left`, use `transform: scale` instead of `width/height`

### 3. transition shorthand (high)

- never use `transition: all` — animates every property that changes, including unintended ones
- always list specific properties: `transition-property: transform, opacity`
- when multiple properties share duration/easing, use shorthand for duration and list properties separately:
  ```css
  .element {
    transition: 200ms ease-out;
    transition-property: transform, opacity;
  }
  ```

### 4. clip-path as alternative (medium)

- use `clip-path: inset()` for reveal animations instead of animating height
- clip-path is hardware-accelerated and causes no layout shift — the element still occupies original space
- animatable between matching shapes: `inset()`, `circle()`, `ellipse()`, `polygon()`
- ideal for scroll-triggered image reveals, tab indicator highlights, theme transitions

## common fixes

```css
/* layout thrash: animate transform instead of position */
/* before */
.slide {
  transition: left 300ms ease;
  left: 0;
}
/* after */
.slide {
  transition: transform 300ms ease;
  transform: translateX(0);
}

/* layout thrash: use scale instead of width */
/* before */
.expand {
  transition: width 300ms ease;
}
/* after */
.expand {
  transition: transform 300ms ease;
  transform: scaleX(1);
}

/* transition: all catches unintended properties */
/* before */
.card {
  transition: all 200ms ease;
}
/* after */
.card {
  transition: 200ms ease;
  transition-property: transform, opacity;
}

/* height animation causes layout shift — use clip-path */
/* before */
.reveal {
  transition: height 500ms ease;
  height: 0;
  overflow: hidden;
}
/* after */
.reveal {
  clip-path: inset(0 0 100% 0);
  animation: reveal 500ms forwards ease;
}
```

## review guidance

- if an animation triggers layout (width, height, margin, padding, top, left), replace with transform or clip-path
- if `transition: all` is present, replace with explicit property list
- if a reveal animation uses height, consider clip-path instead — no layout shift, GPU-accelerated
- check Chrome DevTools Performance panel for layout thrashing during animation
