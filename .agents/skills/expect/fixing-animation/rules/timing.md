---
name: timing
description: Choose correct animation durations and identify what should never be animated. Use when setting transition durations, implementing interaction feedback, or deciding whether to animate a UI element.
---

# Timing

## when to apply

Reference these rules when:

- setting duration for any CSS transition or animation
- implementing hover states, tooltips, button feedback
- building content transitions, page changes, expanding panels
- evaluating whether an element should be animated at all

## rule categories by priority

| priority | category                   | impact   |
| -------- | -------------------------- | -------- |
| 1        | never animate              | critical |
| 2        | interaction feedback       | critical |
| 3        | content transitions        | high     |
| 4        | marketing and storytelling | low      |
| 5        | frequency awareness        | medium   |

## quick reference

### 1. never animate (critical)

- arrow key navigation through lists, menus, or options
- keyboard shortcut responses
- tab and focus movements
- these repeat hundreds of times daily — any animation makes them feel slow and disconnected

### 2. interaction feedback (critical)

- use `100–200ms` for hover states, tooltip appearance, button press feedback, toggle switches
- never exceed `200ms` for direct interaction feedback
- a faster-spinning spinner makes apps feel faster even with identical load times
- 180ms select animation feels more responsive than 400ms with the same easing

### 3. content transitions (high)

- use `200–400ms` for page changes, expanding panels, menus, modals, drawer open/close
- content transitions need more time because the user is tracking larger visual changes
- within this range, shorter is almost always better — start at 200ms and increase only if it feels abrupt

### 4. marketing and storytelling (low)

- `400ms+` is reserved for marketing page animations, landing page storytelling, scroll-triggered reveals
- acceptable because these pages are viewed less frequently
- even on marketing pages, if everything animates, nothing stands out — be selective

### 5. frequency awareness (medium)

- test by using your own product daily
- what feels delightful the first time becomes annoying on the 50th
- a hover effect is nice, but if triggered multiple times per session it may benefit from no animation at all
- frequently-used elements should have the shortest possible duration or no animation

## common fixes

```css
/* too slow for interaction feedback */
/* before */
.button:hover {
  transition: background 400ms ease;
}
/* after */
.button:hover {
  transition: background 150ms ease;
}

/* too slow for a tooltip */
/* before */
.tooltip {
  transition: opacity 350ms ease-out;
}
/* after */
.tooltip {
  transition: opacity 125ms ease-out;
}

/* animation on keyboard navigation — remove entirely */
/* before */
.list-item:focus {
  transition: background 200ms ease;
}
/* after */
.list-item:focus {
  background: var(--focus-bg);
}
```

## review guidance

- if the user triggers it with a click, hover, or tap, keep it under 200ms
- if it is a content-level transition (panel, modal, page), keep it under 400ms
- if it responds to keyboard input (arrows, tab, shortcuts), remove the animation entirely
- when in doubt, shorter is better — users notice slow animations more than fast ones
