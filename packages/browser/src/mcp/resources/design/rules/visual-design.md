---
name: visual-design
description: Visual polish rules for shadows, borders, spacing, and button anatomy. Use when styling cards, buttons, elevation, or reviewing visual consistency.
---

# Visual Design

## when to apply

Reference these rules when:

- styling cards, buttons, or elevated elements
- configuring shadows or depth hierarchy
- setting up a spacing scale
- reviewing visual consistency across components

## rules by priority

| priority | rule                     | impact |
| -------- | ------------------------ | ------ |
| 1        | concentric border radius | high   |
| 2        | shadow system            | high   |
| 3        | spacing scale            | medium |
| 4        | border colors            | medium |

### 1. concentric border radius (high)

Inner radius = outer radius minus padding. Nested elements with identical border-radius look wrong — the inner curve should be tighter.

```css
.outer {
  border-radius: 16px;
  padding: 8px;
}
.inner {
  border-radius: 8px;
} /* 16 - 8 = 8 */

.outer {
  border-radius: 24px;
  padding: 12px;
}
.inner {
  border-radius: 12px;
} /* 24 - 12 = 12 */
```

### 2. shadow system (high)

- layer multiple shadows for realistic depth — single shadows look flat
- all shadows share the same offset direction (single light source)
- never use pure black for shadows — use neutral semi-transparent colors
- shadow size indicates elevation in a consistent scale
- animate shadows via pseudo-element opacity for performance (avoid animating `box-shadow` directly)

```css
/* layered shadows */
.card {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.07),
    0 2px 4px rgba(0, 0, 0, 0.07),
    0 4px 8px rgba(0, 0, 0, 0.07),
    0 8px 16px rgba(0, 0, 0, 0.05);
}

/* animate shadow via pseudo-element */
.card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
  opacity: 0;
  transition: opacity 200ms ease-out;
}
.card:hover::after {
  opacity: 1;
}
```

### 3. spacing scale (medium)

- use a consistent spacing scale — not arbitrary values
- common scale: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px
- tighter spacing groups related elements (proximity principle)
- wider spacing separates unrelated groups

### 4. border colors (medium)

- semi-transparent borders (`rgba` or `hsla` with alpha) adapt to any background
- avoids maintaining separate border colors for light/dark themes

```css
.card {
  border: 1px solid rgba(0, 0, 0, 0.1);
}

/* dark mode automatically adjusts */
.dark .card {
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

## button shadow anatomy

Polished buttons use up to six shadow layers for depth, inner glow, and pressed states:

```css
.button {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.1),
    0 1px 1px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.button:active {
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.15),
    inset 0 1px 1px rgba(0, 0, 0, 0.1);
}
```

## review guidance

- if nested elements share the same border-radius, flag — inner should be outer minus padding
- if shadows use pure black (`#000` / `rgb(0,0,0)`), switch to semi-transparent neutral
- if shadows point in different directions across components, flag inconsistent light source
- if `box-shadow` is animated directly, flag performance — use pseudo-element opacity
- if spacing uses arbitrary values (13px, 17px, 22px), flag — align to scale
