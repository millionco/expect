---
name: typography
description: Typography rules for web interfaces. Use when styling numbers, configuring OpenType features, setting text-wrap, or loading fonts.
---

# Typography

## when to apply

Reference these rules when:

- displaying numbers in tables, dashboards, or pricing
- configuring font features for a design system
- setting up font loading strategy
- styling headings, body text, or code-adjacent UI

## rules by priority

| priority | rule                  | impact |
| -------- | --------------------- | ------ |
| 1        | tabular nums for data | high   |
| 2        | font loading          | high   |
| 3        | text-wrap             | medium |
| 4        | OpenType features     | medium |

### 1. tabular nums for data (high)

- `font-variant-numeric: tabular-nums` on columns, dashboards, pricing, timers
- without tabular nums, numbers shift horizontally as values change — layout instability
- oldstyle nums (`font-variant-numeric: oldstyle-nums`) for body text where numbers blend into prose

### 2. font loading (high)

- `font-display: swap` to avoid invisible text during load
- `<link rel="preload" as="font">` for critical fonts
- disable `font-synthesis` to prevent browser-generated faux bold/italic
- `font-optical-sizing: auto` for size-adaptive glyph adjustment

### 3. text-wrap (medium)

- `text-wrap: balance` on headings — distributes text evenly across lines, prevents widows
- `text-wrap: pretty` on body text — reduces orphans
- pair `text-align: justify` with `hyphens: auto`

### 4. OpenType features (medium)

- keep contextual alternates (`calt`) enabled for glyph adjustment
- enable `ss02` (stylistic set) to distinguish `I`/`l`/`1` and `0`/`O` in code-adjacent UI
- slashed zero (`font-variant-numeric: slashed-zero`) for code contexts
- use `font-variant-numeric: diagonal-fractions` for proper typographic fractions
- continuous weight values (100–900) with variable fonts
- add `letter-spacing` to uppercase and small-caps text
- offset underlines below descenders with `text-underline-offset`

## common fixes

```css
/* tabular nums for data alignment */
.table-cell,
.price,
.timer {
  font-variant-numeric: tabular-nums;
}

/* balanced headings */
h1,
h2,
h3 {
  text-wrap: balance;
}

/* font loading */
@font-face {
  font-family: "Inter";
  font-display: swap;
  src: url("/fonts/inter.woff2") format("woff2");
}

/* prevent faux bold/italic */
body {
  font-synthesis: none;
}

/* code-adjacent disambiguation */
.code-context {
  font-variant-numeric: slashed-zero;
  font-feature-settings: "ss02" 1;
}
```

## review guidance

- if number columns lack `tabular-nums`, flag layout shift risk
- if `font-display` is missing from `@font-face`, flag invisible text during load
- if headings lack `text-wrap: balance`, flag uneven line distribution
- if uppercase text lacks `letter-spacing`, flag readability issue
