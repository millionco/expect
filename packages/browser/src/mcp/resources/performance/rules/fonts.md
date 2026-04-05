# Font Optimization Patterns

The parent rule covers `font-display: swap`, preloading, variable fonts, and subsetting. This sub-rule covers **CLS prevention** and **@font-face patterns**.

## Variable Font @font-face

One file replaces multiple weight files:

```css
@font-face {
  font-family: "Inter";
  src: url("/fonts/Inter-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
}
```

## Subsetting

Only load characters you need:

```css
@font-face {
  font-family: "Custom Font";
  src: url("/fonts/custom.woff2") format("woff2");
  font-display: swap;
  unicode-range: U+0000-00FF; /* Latin only */
}
```

## CLS Prevention: Matching Fallback Metrics

Font swap causes layout shift when custom and fallback fonts have different metrics. Two approaches:

**Option 1: `font-display: optional`** — no shift, but font may not load on slow connections.

**Option 2: Adjust fallback metrics** — minimize shift while keeping swap:

```css
@font-face {
  font-family: "Custom";
  src: url("custom.woff2") format("woff2");
  font-display: swap;
  size-adjust: 105%;
  ascent-override: 95%;
  descent-override: 20%;
}
```

Use [fontpie](https://github.com/nicolo-ribaudo/fontpie) or the Next.js font system to calculate overrides automatically.
