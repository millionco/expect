---
name: design
description: >
  UI/UX design principles and web interface guidelines. Use when implementing animations, choosing
  between springs and easing, adding audio feedback, applying UX psychology, fixing typography,
  styling shadows/borders/spacing, reviewing UI code, checking accessibility, or auditing design.
version: 1.0.0
---

# UI/UX Design & Web Interface Guidelines

Fetch `expect://rules/design/<sub-rule>` for detailed guides.

## Design Principles

- [ ] User-driven motion (drag, flick) → springs; system-driven → easing; high-frequency → none
- [ ] User-initiated animations complete within 300ms
- [ ] Respond to interactions within 400ms (Doherty Threshold)
- [ ] Interactive targets minimum 32px; expand with pseudo-elements if needed
- [ ] Squash/stretch range: 0.95–1.05; one focal-point animation at a time
- [ ] Context menus: no entrance animation, exit only
- [ ] Every sound must have a visual equivalent
- [ ] `prefers-reduced-motion` respected for both motion and audio
- [ ] Use layered shadows with semi-transparent neutrals, not pure black
- [ ] Concentric border radius: inner = outer - padding
- [ ] `font-variant-numeric: tabular-nums` for number columns
- [ ] `text-wrap: balance` on headings

## Web Interface Rules

- [ ] Icon-only buttons need `aria-label`; form controls need `<label>`
- [ ] `<button>` for actions, `<a>` for navigation — never `<div onClick>`
- [ ] Visible focus states: `focus-visible:ring-*`; never bare `outline: none`
- [ ] Inputs need `autocomplete`, correct `type`/`inputmode`; never block paste
- [ ] Errors inline next to fields; focus first error on submit
- [ ] Animate only `transform`/`opacity`; never `transition: all`
- [ ] Animations must be interruptible; honor `prefers-reduced-motion`
- [ ] Use `…` not `...`; curly quotes; non-breaking spaces for units/shortcuts
- [ ] Handle long content: truncate, line-clamp, or break-words; handle empty states
- [ ] Images need explicit `width`/`height`; lazy-load below fold; prioritize LCP images
- [ ] Virtualize lists > 50 items; no layout reads in render
- [ ] URL reflects state (filters, tabs, pagination); deep-link stateful UI
- [ ] `touch-action: manipulation`; `overscroll-behavior: contain` in modals
- [ ] `color-scheme: dark` on `<html>`; `<meta name="theme-color">` matches background
- [ ] Dates/numbers via `Intl.*` — never hardcoded formats
- [ ] Guard against hydration mismatches for dates/times
- [ ] Destructive actions need confirmation or undo — never immediate

## Sub-Rules

- `expect://rules/design/animation-principles`
- `expect://rules/design/audio-feedback`
- `expect://rules/design/container-animation`
- `expect://rules/design/exit-animations`
- `expect://rules/design/laws-of-ux`
- `expect://rules/design/timing-functions`
- `expect://rules/design/typography`
- `expect://rules/design/visual-design`
