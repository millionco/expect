---
name: performance
description: >
  Web performance optimization for fast-loading sites. Use when optimizing load times,
  reducing bundle size, fixing Core Web Vitals (LCP/FCP/TBT/CLS), implementing image
  strategies, adding prefetching, eliminating loading spinners, streaming content,
  or auditing resource budgets.
---

# Web Performance

## Checklist

### Performance Budgets

- [ ] Total page weight < 1.5 MB; JS < 300 KB; CSS < 100 KB; fonts < 100 KB
- [ ] Above-fold images < 500 KB; third-party < 200 KB

### Core Web Vitals

- [ ] LCP < 2.5s; FCP < 1.8s; TBT < 200ms; Speed Index < 3.4s; TTI < 3.8s; TTFB < 800ms

### Server Response

- [ ] TTFB < 800ms — CDN, edge caching, efficient backends
- [ ] Brotli compression (15-20% smaller than gzip)
- [ ] HTTP/2+ for multiplexing; edge-cache HTML when possible

### Streaming Over Spinners

- [ ] Never show loading spinners for initial content — stream from server
- [ ] Use Suspense boundaries with skeleton fallbacks
- [ ] Use Partial Prerendering (PPR) in Next.js when available

### Images

- [ ] Prefer AVIF > WebP > PNG/SVG by use case
- [ ] LCP image: `fetchpriority="high"`, `loading="eager"`, `decoding="sync"`
- [ ] Below-fold images: `loading="lazy"`, `decoding="async"`
- [ ] All `<img>` have explicit `width` and `height` (prevents CLS)
- [ ] Prefetch destination page images on hover/focus
- [ ] Use `<picture>` with format fallbacks and responsive `srcset`/`sizes`

### Fonts

- [ ] `font-display: swap`; preload critical fonts
- [ ] Use variable fonts; subset to needed unicode ranges

### Caching

- [ ] HTML: `no-cache, must-revalidate`
- [ ] Hashed assets: `max-age=31536000, immutable`
- [ ] API: `private, max-age=0, must-revalidate`

### Script Loading

- [ ] `<script defer>` for app bundles; `async` for analytics
- [ ] Code-split heavy components with `lazy()`
- [ ] Tree-shake: import specific functions, not entire libraries
- [ ] `<link rel="preconnect">` for CDN/asset domains
- [ ] `<link rel="preload">` for critical resources (hero image, fonts)

### Runtime Performance

- [ ] Batch DOM reads then writes — never interleave (layout thrashing)
- [ ] Virtualize long lists (>100 items): `content-visibility` or virtual list library
- [ ] Debounce scroll/resize handlers with `{ passive: true }`
- [ ] Trigger navigation on `mouseDown` for perceived speed

### Third-Party Scripts

- [ ] Load analytics `async` — never block main thread
- [ ] Delay widgets until interaction (IntersectionObserver)
- [ ] Facade pattern for embeds (static placeholder until click)
