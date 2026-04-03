---
name: timing-functions
description: Choose between springs, easing curves, linear, and no animation. Use when deciding how motion should behave for a specific interaction type.
---

# Timing Functions

Springs and easing curves are not interchangeable — they come from different models of motion and play different roles.

## when to apply

Reference these rules when:

- choosing the animation type for any motion
- implementing drag, flick, or gesture-driven interactions
- configuring spring stiffness/damping/mass or cubic-bezier values
- an animation feels "off" and you can't pinpoint why

## decision framework

Ask: **is this motion reacting to the user, or is the system speaking?**

| Motion type                        | Timing function                      | Why                                       |
| ---------------------------------- | ------------------------------------ | ----------------------------------------- |
| Drag, flick, press, gestures       | Spring                               | Preserves velocity, survives interruption |
| State change, notification         | Ease-out (entrance) / Ease-in (exit) | Predictable, controlled                   |
| View/mode transition               | Ease-in-out                          | Even attention across both states         |
| Progress bar, loader, scrubbing    | Linear                               | Represents time itself                    |
| Typing, keyboard nav, fast toggles | None                                 | Immediacy over expressiveness             |

## spring rules

- gesture-driven motion **must** use springs — CSS transitions snap on interrupt
- springs preserve input energy on release (fast drag = snappy return, slow drag = heavy return)
- no-bounce is the default for product UI — bounce only for drag gestures with physical force
- stiffness: start ~300 for snappy UI. damping: start ~20-30 for no-bounce. mass: keep at 1

## easing rules

- `ease-out` for entrances — fast start creates responsiveness, soft landing for the eye
- `ease-in` for exits — starts slow, accelerates away, gets out of the way
- `ease-in-out` for transitions between equally important states
- linear only for progress/time representation — never for spatial movement
- built-in CSS curves are usually too weak — use custom `cubic-bezier` values

## duration rules

| Interaction        | Duration  |
| ------------------ | --------- |
| Press, hover       | 120–180ms |
| Small state change | 180–260ms |
| User-initiated max | 300ms     |

- if it feels slow, shorten the duration first — not the curve
- springs have no fixed duration; they settle naturally based on physics

## common fixes

```css
/* easing: entrance with ease-out */
.entering {
  transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* easing: exit with ease-in */
.exiting {
  transition: opacity 150ms ease-in;
}

/* linear: only for progress */
.progress-fill {
  transition: width 100ms linear;
}
```

```tsx
/* spring: gesture-driven interaction */
<motion.div
  drag
  dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
  transition={{ type: "spring", stiffness: 300, damping: 20 }}
/>
```

## review guidance

- if a gesture-driven animation uses CSS transitions, flag — needs spring
- if ease-in is used for an entrance, flag — should be ease-out
- if linear is used for spatial movement, flag — should be ease-out or spring
- if duration exceeds 300ms for user interaction, shorten it
- if spring has visible bounce on standard UI (menu, dialog, button), set bounce to 0
