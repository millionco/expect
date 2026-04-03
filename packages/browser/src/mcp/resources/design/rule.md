---
name: design
description: >
  UI/UX design principles and web interface guidelines. Use when implementing animations, choosing
  between springs and easing, adding audio feedback, applying UX psychology, fixing typography,
  styling shadows/borders/spacing, reviewing UI code, checking accessibility, or auditing design.
version: 1.0.0
---

# UI/UX Design Principles

Practical design rules distilled from [userinterface.wiki](https://www.userinterface.wiki/). Fetch `expect://rules/design/<sub-rule>` for detailed guides.

## Rules

| Rule                 | File                                         | When to apply                                              |
| -------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| Animation Principles | `expect://rules/design/animation-principles` | Squash/stretch, staging, anticipation, timing, appeal      |
| Timing Functions     | `expect://rules/design/timing-functions`     | Choosing springs vs easing vs linear vs no animation       |
| Exit Animations      | `expect://rules/design/exit-animations`      | AnimatePresence modes, nested exits, manual exit control   |
| Audio Feedback       | `expect://rules/design/audio-feedback`       | Adding sound to interactions, Web Audio API, accessibility |
| Laws of UX           | `expect://rules/design/laws-of-ux`           | Fitts's Law, Hick's Law, Miller's Law, Doherty Threshold   |
| Container Animation  | `expect://rules/design/container-animation`  | Animating width/height with useMeasure + Motion            |
| Typography           | `expect://rules/design/typography`           | Tabular nums, OpenType features, text-wrap, font loading   |
| Visual Design        | `expect://rules/design/visual-design`        | Shadows, border radius, spacing scales, button anatomy     |

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
.outer {
  border-radius: 16px;
  padding: 8px;
}
.inner {
  border-radius: 8px;
} /* 16 - 8 = 8 */

/* tabular nums for data */
.price,
.table-cell {
  font-variant-numeric: tabular-nums;
}

/* balanced headings */
h1,
h2,
h3 {
  text-wrap: balance;
}

/* layered shadows for depth */
.card {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.07),
    0 2px 4px rgba(0, 0, 0, 0.07),
    0 4px 8px rgba(0, 0, 0, 0.07),
    0 8px 16px rgba(0, 0, 0, 0.05);
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

---

## Web Interface Guidelines

### Accessibility

- Icon-only buttons need `aria-label`
- Form controls need `<label>` or `aria-label`
- Custom interactive elements (non-native `<div>`/`<span>` with handlers) need keyboard handlers (`onKeyDown`/`onKeyUp`)
- `<button>` for actions, `<a>`/`<Link>` for navigation (not `<div onClick>`)
- Images need `alt` (or `alt=""` if decorative)
- Decorative icons need `aria-hidden="true"`
- Async updates (toasts, validation) need `aria-live="polite"`
- Use semantic HTML (`<button>`, `<a>`, `<label>`, `<table>`) before ARIA
- Headings hierarchical `<h1>`–`<h6>`; include skip link for main content
- `scroll-margin-top` on heading anchors

### Focus States

- Interactive elements need visible focus: `focus-visible:ring-*` or equivalent
- Never `outline-none` / `outline: none` without focus replacement
- Use `:focus-visible` over `:focus` (avoid focus ring on click)
- Group focus with `:focus-within` for compound controls

### Forms

- Inputs need `autocomplete` and meaningful `name`
- Use correct `type` (`email`, `tel`, `url`, `number`) and `inputmode`
- Never block paste (`onPaste` + `preventDefault`)
- Labels clickable (`htmlFor` or wrapping control)
- Disable spellcheck on emails, codes, usernames (`spellCheck={false}`)
- Checkboxes/radios: label + control share single hit target (no dead zones)
- Submit button stays enabled until request starts; spinner during request
- Errors inline next to fields; focus first error on submit
- Placeholders end with `…` and show example pattern
- `autocomplete="off"` on non-auth fields to avoid password manager triggers
- Warn before navigation with unsaved changes (`beforeunload` or router guard)

### Animation

- Honor `prefers-reduced-motion` (provide reduced variant or disable)
- Animate `transform`/`opacity` only (compositor-friendly)
- Never `transition: all`—list properties explicitly
- Set correct `transform-origin`
- SVG: transforms on `<g>` wrapper with `transform-box: fill-box; transform-origin: center`
- Animations interruptible—respond to user input mid-animation

### Typography

- `…` not `...`
- Curly quotes `"` `"` not straight `"`
- Non-breaking spaces: `10&nbsp;MB`, `⌘&nbsp;K`, brand names
- Loading states end with `…`: `"Loading…"`, `"Saving…"`
- `font-variant-numeric: tabular-nums` for number columns/comparisons
- Use `text-wrap: balance` or `text-pretty` on headings (prevents widows)

### Content Handling

- Text containers handle long content: `truncate`, `line-clamp-*`, or `break-words`
- Flex children need `min-w-0` to allow text truncation
- Handle empty states—don't render broken UI for empty strings/arrays
- User-generated content: anticipate short, average, and very long inputs

### Images

- `<img>` needs explicit `width` and `height` (prevents CLS)
- Below-fold images: `loading="lazy"`
- Above-fold critical images: `priority` or `fetchpriority="high"`

### Performance

- Large lists (>50 items): virtualize (`virtua`, `content-visibility: auto`)
- No layout reads in render (`getBoundingClientRect`, `offsetHeight`, `offsetWidth`, `scrollTop`)
- Batch DOM reads/writes; avoid interleaving
- Prefer uncontrolled inputs; controlled inputs must be cheap per keystroke
- Add `<link rel="preconnect">` for CDN/asset domains
- Critical fonts: `<link rel="preload" as="font">` with `font-display: swap`

### Navigation & State

- URL reflects state—filters, tabs, pagination, expanded panels in query params
- Links use `<a>`/`<Link>` (Cmd/Ctrl+click, middle-click support)
- Deep-link all stateful UI (if uses `useState`, consider URL sync via nuqs or similar)
- Destructive actions need confirmation modal or undo window—never immediate

### Touch & Interaction

- `touch-action: manipulation` (prevents double-tap zoom delay)
- `-webkit-tap-highlight-color` set intentionally
- `overscroll-behavior: contain` in modals/drawers/sheets
- During drag: disable text selection, `inert` on dragged elements
- `autoFocus` sparingly—desktop only, single primary input; avoid on mobile

### Safe Areas & Layout

- Full-bleed layouts need `env(safe-area-inset-*)` for notches
- Avoid unwanted scrollbars: `overflow-x-hidden` on containers, fix content overflow
- Flex/grid over JS measurement for layout

### Dark Mode & Theming

- `color-scheme: dark` on `<html>` for dark themes (fixes scrollbar, inputs)
- `<meta name="theme-color">` matches page background
- Native `<select>`: explicit `background-color` and `color` (Windows dark mode)

### Locale & i18n

- Dates/times: use `Intl.DateTimeFormat` not hardcoded formats
- Numbers/currency: use `Intl.NumberFormat` not hardcoded formats
- Detect language via `Accept-Language` / `navigator.languages`, not IP

### Hydration Safety

- Inputs with `value` need `onChange` (or use `defaultValue` for uncontrolled)
- Date/time rendering: guard against hydration mismatch (server vs client)
- `suppressHydrationWarning` only where truly needed

### Hover & Interactive States

- Buttons/links need `hover:` state (visual feedback)
- Interactive states increase contrast: hover/active/focus more prominent than rest

### Content & Copy

- Active voice: "Install the CLI" not "The CLI will be installed"
- Title Case for headings/buttons (Chicago style)
- Numerals for counts: "8 deployments" not "eight"
- Specific button labels: "Save API Key" not "Continue"
- Error messages include fix/next step, not just problem
- Second person; avoid first person
- `&` over "and" where space-constrained

### Anti-patterns (flag these)

- `user-scalable=no` or `maximum-scale=1` disabling zoom
- `onPaste` with `preventDefault`
- `transition: all`
- `outline-none` without focus-visible replacement
- Inline `onClick` navigation without `<a>`
- `<div>` or `<span>` with click handlers (should be `<button>`)
- Images without dimensions
- Large arrays `.map()` without virtualization
- Form inputs without labels
- Icon buttons without `aria-label`
- Hardcoded date/number formats (use `Intl.*`)
- `autoFocus` without clear justification

## Output Format

Group by file. Use `file:line` format (VS Code clickable). Terse findings.

```text
## src/Button.tsx

src/Button.tsx:42 - icon button missing aria-label
src/Button.tsx:18 - input lacks label
src/Button.tsx:55 - animation missing prefers-reduced-motion
src/Button.tsx:67 - transition: all → list properties

## src/Modal.tsx

src/Modal.tsx:12 - missing overscroll-behavior: contain
src/Modal.tsx:34 - "..." → "…"

## src/Card.tsx

✓ pass
```

State issue + location. Skip explanation unless fix non-obvious. No preamble.
