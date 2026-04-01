---
name: animation-principles
description: The 12 Principles of Animation applied to web UI. Use when implementing motion, reviewing animation quality, or deciding whether/how to animate an element.
---

# Animation Principles

The 12 Principles of Animation (Disney, 1930s) adapted for web interfaces. Great animation is invisible — users think "this feels good," not "nice ease-out curve."

## when to apply

Reference these rules when:

- adding motion to any UI element
- reviewing existing animations for quality
- deciding whether an element should animate at all

## rule categories by priority

| priority | category                          | impact   |
| -------- | --------------------------------- | -------- |
| 1        | timing & consistency              | critical |
| 2        | staging & focus                   | critical |
| 3        | physics & weight                  | high     |
| 4        | secondary action & appeal         | medium   |

## quick reference

### 1. timing & consistency (critical)

- user-initiated animations complete within 300ms
- identical elements use identical timing — inconsistent timing creates subconscious unease
- context menus: no entrance animation, exit only (used too frequently for entrance to not annoy)
- define a timing scale early (e.g. 120ms, 200ms, 300ms) and reuse everywhere

### 2. staging & focus (critical)

- one prominent animation at a time — if everything animates simultaneously, attention scatters
- dim backgrounds when presenting modals/dialogs/cards
- animated elements respect z-index hierarchy
- think of staging as directing a film: manipulate attention, don't scatter it

### 3. physics & weight (high)

- squash/stretch in 0.95–1.05 scale range — beyond that turns UI into a cartoon
- springs for overshoot-and-settle, not easing curves
- stagger delays under 50ms per item — more feels sluggish
- use exponential ramps for natural decay, never linear
- `:active` scale transform on interactive elements (e.g. `scale(0.97)`)
- don't animate from `scale(0)` — start at `scale(0.95)` with `opacity: 0`

### 4. secondary action & appeal (medium)

- secondary actions (sparkles, sound effects) support the main action without stealing focus
- anticipation: subtle cues before major actions (button compress before submit, elastic pull-to-refresh)
- arcs for hero moments and landing pages; straight lines for utilitarian UI
- exaggeration sparingly: onboarding, empty states, confirmations, error notifications

## review guidance

- if multiple elements animate simultaneously with equal prominence, flag staging issue
- if squash/stretch exceeds 0.95–1.05, reduce to subtle range
- if stagger delay exceeds 50ms per item, flag latency concern
- if context menus animate on entrance, remove the entrance animation
- if timing is inconsistent across similar elements, unify to a shared scale
