# Mobile & International SEO

The parent rule covers viewport meta, responsive design, and `html lang`. This sub-rule covers **tap targets, font sizing, and hreflang**.

## Tap Target Sizing

Interactive elements must be large enough for touch input. Google flags targets < 48×48px.

```css
.touch-target {
  min-height: 48px;
  min-width: 48px;
  padding: 12px;
}
```

Input `font-size` must be at least 16px — below 16px triggers Safari viewport auto-zoom on focus.

## Hreflang for Multi-Language Sites

```html
<link rel="alternate" hreflang="en" href="https://example.com/page" />
<link rel="alternate" hreflang="es" href="https://example.com/es/page" />
<link rel="alternate" hreflang="x-default" href="https://example.com/page" />
```

- Only add alternates for pages that actually exist
- Each localized page canonicalizes within its own locale
- Set `og:locale` when content is localized
