---
name: animation-consistency
description: Maintain a consistent animation language across a product. Use when establishing animation standards, reviewing animation inconsistencies, or building a design system's motion tokens.
---

# Consistency

## when to apply

Reference these rules when:

- establishing animation conventions for a project or design system
- reviewing UI for inconsistent animation behavior across components
- deciding animation values for a new component that should match existing ones
- defining motion tokens or design system animation variables

## rule categories by priority

| priority | category                   | impact   |
| -------- | -------------------------- | -------- |
| 1        | uniform animation language | critical |
| 2        | brand alignment            | high     |
| 3        | motion tokens              | high     |
| 4        | restraint                  | medium   |

## quick reference

### 1. uniform animation language (critical)

- all buttons must scale the same amount on press (0.97)
- all popovers must use the same easing and duration
- all exit animations must fade with the same duration
- all stagger delays must use the same interval
- inconsistency feels broken — users subconsciously notice when two similar elements animate differently

### 2. brand alignment (high)

- animation speed conveys personality
- slow, measured motion = premium, reliable (Stripe style)
- fast, snappy motion = innovative, cutting-edge (Linear, Vercel style)
- choose one personality and apply it uniformly — mixing fast and slow without reason feels confused
- the chosen speed should match the product's identity and audience expectations

### 3. motion tokens (high)

- define animation values as shared constants, not inline values
- standard token set: duration (fast, normal, slow), easing (enter, exit, move), scale (press feedback)
- example token values:
  - `duration-fast: 125ms` (hover, tooltip)
  - `duration-normal: 200ms` (dropdown, popover)
  - `duration-slow: 350ms` (modal, drawer)
  - `ease-enter: cubic-bezier(0.32, 0.72, 0, 1)`
  - `ease-move: ease-in-out`
  - `scale-press: 0.97`
- tokens prevent drift — when every component references the same values, consistency is automatic

### 4. restraint (medium)

- never add animation unless it serves a functional purpose or is explicitly requested
- if everything animates, nothing stands out — animation should highlight, not decorate
- the best animations go unnoticed — users complete tasks without friction, not admiring effects
- marketing pages allow more elaborate animations since they're viewed less often
- even on marketing pages, be selective about what moves

## common fixes

```css
/* inconsistent durations across similar components */
/* before */
.dropdown {
  transition: opacity 250ms ease-out;
}
.tooltip {
  transition: opacity 180ms ease;
}
.popover {
  transition: opacity 300ms ease-out;
}
/* after — unified tokens */
:root {
  --duration-fast: 125ms;
  --duration-normal: 200ms;
  --ease-enter: cubic-bezier(0.32, 0.72, 0, 1);
}
.dropdown {
  transition: opacity var(--duration-normal) var(--ease-enter);
}
.tooltip {
  transition: opacity var(--duration-fast) var(--ease-enter);
}
.popover {
  transition: opacity var(--duration-normal) var(--ease-enter);
}

/* inconsistent press feedback */
/* before */
.button-primary:active {
  transform: scale(0.95);
}
.button-secondary:active {
  transform: scale(0.9);
}
/* after */
.button-primary:active,
.button-secondary:active {
  transform: scale(0.97);
}
```

## review guidance

- if two similar components have different animation values, unify them
- if animation durations or easing are hardcoded inline, extract to shared tokens
- if a component has animation that doesn't exist on similar components, question whether it's needed
- if the overall animation personality feels mixed (some fast, some slow), align to one speed profile
