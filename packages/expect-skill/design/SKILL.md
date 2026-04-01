---
name: design
description: >
  UI/UX design principles for polished web interfaces. Use when implementing animations, choosing
  between springs and easing, adding audio feedback, applying UX psychology (Fitts's, Hick's, Miller's
  laws), fixing typography, styling shadows/borders/spacing, animating container bounds, or building
  exit animations with AnimatePresence.
version: 1.0.0
---

# UI/UX Design Principles

Practical design rules distilled from [userinterface.wiki](https://www.userinterface.wiki/). See `rules/` for detailed guides.

## Rules

| Rule                | File                          | When to apply                                                  |
| ------------------- | ----------------------------- | -------------------------------------------------------------- |
| Animation Principles | `rules/animation-principles.md` | Squash/stretch, staging, anticipation, timing, appeal        |
| Timing Functions    | `rules/timing-functions.md`    | Choosing springs vs easing vs linear vs no animation           |
| Exit Animations     | `rules/exit-animations.md`     | AnimatePresence modes, nested exits, manual exit control       |
| Audio Feedback      | `rules/audio-feedback.md`      | Adding sound to interactions, Web Audio API, accessibility     |
| Laws of UX          | `rules/laws-of-ux.md`          | Fitts's Law, Hick's Law, Miller's Law, Doherty Threshold      |
| Container Animation | `rules/container-animation.md` | Animating width/height with useMeasure + Motion                |
| Typography          | `rules/typography.md`          | Tabular nums, OpenType features, text-wrap, font loading       |
| Visual Design       | `rules/visual-design.md`       | Shadows, border radius, spacing scales, button anatomy         |

## Decision Framework

Before adding motion, ask: **is this motion reacting to the user, or is the system speaking?**

- **User-driven** (drag, flick, press) → springs
- **System-driven** (state change, notification) → easing curves
- **High-frequency** (typing, keyboard nav, fast toggles) → no animation
- **Progress/time representation** (loaders, scrubbing) → linear

## Core Constraints

- User-initiated animations complete within 300ms
- Respond to interactions within 400ms (Doherty Threshold)
- Interactive targets minimum 32px
- Squash/stretch in 0.95–1.05 range
- One focal-point animation at a time
- Similar elements use identical timing values
- Context menus: no entrance animation, exit only
- Every sound has a visual equivalent
- `prefers-reduced-motion` respected for both motion and audio

## Quick Fixes

```css
/* expand hit area without visible padding */
.icon-button::before {
  content: "";
  position: absolute;
  inset: -8px;
}

/* concentric border radius */
.outer { border-radius: 16px; padding: 8px; }
.inner { border-radius: 8px; } /* 16 - 8 = 8 */

/* tabular nums for data */
.price, .table-cell { font-variant-numeric: tabular-nums; }

/* balanced headings */
h1, h2, h3 { text-wrap: balance; }

/* layered shadows for depth */
.card {
  box-shadow:
    0 1px 2px rgba(0,0,0,0.07),
    0 2px 4px rgba(0,0,0,0.07),
    0 4px 8px rgba(0,0,0,0.07),
    0 8px 16px rgba(0,0,0,0.05);
}
```

```tsx
/* animated container bounds — two-div pattern */
function AnimatedContainer({ children }) {
  const [ref, bounds] = useMeasure();
  return (
    <motion.div animate={{ height: bounds.height > 0 ? bounds.height : "auto" }}>
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}
```

## Review Guidance

- If an animation exceeds 300ms for user interaction, shorten it
- If a gesture-driven animation uses CSS transitions instead of springs, flag it
- If interactive targets are under 32px, expand with padding or pseudo-elements
- If number columns lack `tabular-nums`, flag layout shift risk
- If shadows use pure black, switch to neutral semi-transparent colors
- If container width/height animates on the same element it measures, flag the loop
- If sound plays without a visual equivalent or toggle option, flag accessibility
