---
name: performance
description: >
  Web performance optimization for fast-loading sites. Use when optimizing load times,
  reducing bundle size, fixing Core Web Vitals (LCP/FCP/TBT/CLS), implementing image
  strategies, adding prefetching, eliminating loading spinners, streaming content,
  or auditing resource budgets.
---

# Web Performance

Lighthouse-based performance optimization with streaming, prefetching, and Core Web Vitals alignment.

## Performance Budget

| Resource              | Budget    | Rationale              |
| --------------------- | --------- | ---------------------- |
| Total page weight     | < 1.5 MB  | 3G loads in ~4s        |
| JavaScript (compressed) | < 300 KB | Parsing + execution    |
| CSS (compressed)      | < 100 KB  | Render blocking        |
| Images (above-fold)   | < 500 KB  | LCP impact             |
| Fonts                 | < 100 KB  | FOIT/FOUT prevention   |
| Third-party           | < 200 KB  | Uncontrolled latency   |

## Core Web Vitals Targets

| Metric       | Target   |
| ------------ | -------- |
| LCP          | < 2.5s   |
| FCP          | < 1.8s   |
| TBT          | < 200ms  |
| Speed Index  | < 3.4s   |
| TTI          | < 3.8s   |
| TTFB         | < 800ms  |

## Server Response

1. **TTFB < 800ms** — CDN, edge caching, efficient backends
2. **Compression** — Brotli preferred (15-20% smaller than gzip)
3. **HTTP/2+** — multiplexing reduces connection overhead
4. **Edge caching** — cache HTML at CDN edge when possible

## Eliminate Loading Spinners with Streaming

Never show loading spinners for initial content. Start data fetches on the server and stream results to the client as they resolve.

**Bad:** Client-side fetch after page load creates a flash of default/empty content.

**Good:** Server starts the fetch, streams HTML as data arrives — no flash, no spinner.

In Next.js, use **Partial Prerendering (PPR)**: the static shell is prerendered at build time and served immediately; dynamic parts stream in via Suspense boundaries.

```tsx
function Page() {
  return (
    <div>
      <StaticNav />
      <Suspense fallback={<Skeleton />}>
        <DynamicContent />
      </Suspense>
      <StaticFooter />
    </div>
  )
}

async function DynamicContent() {
  const data = await fetchData()
  return <ProductGrid data={data} />
}
```

## Image Optimization

### Format selection

| Format | Use case                      | Support |
| ------ | ----------------------------- | ------- |
| AVIF   | Photos, best compression      | 92%+    |
| WebP   | Photos, good fallback         | 97%+    |
| PNG    | Graphics with transparency    | All     |
| SVG    | Icons, logos, illustrations   | All     |

### LCP image: eager, high priority

```html
<img src="hero.webp" fetchpriority="high" loading="eager" decoding="sync" alt="Hero">
```

### Below-fold images: lazy

```html
<img src="product.webp" loading="lazy" decoding="async" alt="Product">
```

### Prefetch images for linked pages

Don't just prefetch HTML — prefetch the images of destination pages too. This eliminates content flash on navigation.

```tsx
function ProductLink({ href, imageUrl, children }) {
  const prefetch = () => {
    const link = document.createElement("link")
    link.rel = "prefetch"
    link.as = "image"
    link.href = imageUrl
    document.head.appendChild(link)
  }

  return (
    <a href={href} onMouseEnter={prefetch} onFocus={prefetch}>
      {children}
    </a>
  )
}
```

### Responsive images with format fallbacks

```html
<picture>
  <source type="image/avif" srcset="img-400.avif 400w, img-800.avif 800w" sizes="(max-width: 600px) 100vw, 50vw">
  <source type="image/webp" srcset="img-400.webp 400w, img-800.webp 800w" sizes="(max-width: 600px) 100vw, 50vw">
  <img src="img-800.jpg" width="800" height="400" alt="Product" loading="lazy" decoding="async">
</picture>
```

## Perceived Speed: mouseDown over mouseUp

Trigger navigation on `mouseDown` instead of the default `mouseUp` (click). The ~100ms delta between press and release makes interactions feel instant.

```tsx
function FastLink({ href, children }) {
  const navigate = useNavigate()
  return (
    <a href={href} onMouseDown={() => navigate(href)}>
      {children}
    </a>
  )
}
```

## Resource Loading

### Preconnect to required origins

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://cdn.example.com" crossorigin>
```

### Preload critical resources

```html
<link rel="preload" href="/hero.webp" as="image" fetchpriority="high">
<link rel="preload" href="/font.woff2" as="font" type="font/woff2" crossorigin>
```

### Defer non-critical CSS

```html
<style>/* inline critical above-fold styles */</style>
<link rel="preload" href="/styles.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
```

## JavaScript Optimization

### Script loading

- `<script defer>` for app bundles (preferred)
- `<script async>` for independent scripts (analytics)
- `<script type="module">` deferred by default

### Code splitting

```tsx
const HeavyChart = lazy(() => import("./HeavyChart"))
```

### Tree shaking

```ts
// BAD — imports entire library
import _ from "lodash"

// GOOD — imports only the function
import debounce from "lodash/debounce"
```

## Font Optimization

```css
@font-face {
  font-family: "Custom";
  src: url("/fonts/custom.woff2") format("woff2");
  font-display: swap;
  unicode-range: U+0000-00FF;
}
```

- Preload critical fonts
- Use variable fonts (one file for all weights)
- Subset to needed unicode ranges

## Caching Strategy

```
# HTML — short or no cache
Cache-Control: no-cache, must-revalidate

# Hashed static assets — immutable
Cache-Control: public, max-age=31536000, immutable

# Unhashed static assets
Cache-Control: public, max-age=86400, stale-while-revalidate=604800

# API responses
Cache-Control: private, max-age=0, must-revalidate
```

## Runtime Performance

### Avoid layout thrashing

Batch all reads, then all writes. Never interleave.

```ts
// BAD
elements.forEach((element) => {
  const height = element.offsetHeight
  element.style.height = height + 10 + "px"
})

// GOOD
const heights = elements.map((element) => element.offsetHeight)
elements.forEach((element, index) => {
  element.style.height = heights[index] + 10 + "px"
})
```

### Virtualize long lists (>100 items)

```css
.virtual-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 50px;
}
```

Or use `react-window` / `@tanstack/virtual` for React.

### Debounce scroll/resize handlers

```ts
window.addEventListener("scroll", debounce(handleScroll, 100), { passive: true })
```

### Use requestAnimationFrame for animations

```ts
function animate() {
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)
```

## Third-Party Scripts

1. Load analytics `async` — never block main thread
2. Delay widgets until interaction (IntersectionObserver)
3. Use facade pattern for embeds (static placeholder until click)

```html
<div class="youtube-facade" onclick="loadYouTube(this)">
  <img src="/thumbnails/abc123.jpg" alt="Video">
  <button aria-label="Play">&#9654;</button>
</div>
```
