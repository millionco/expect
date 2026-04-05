# Image Optimization Patterns

The parent rule covers format preference (AVIF > WebP > PNG/SVG), LCP priority attributes, lazy loading, and dimension requirements. This sub-rule provides **implementation patterns**.

## Responsive `<picture>` with Format Fallbacks

```html
<picture>
  <source
    type="image/avif"
    srcset="hero-400.avif 400w, hero-800.avif 800w, hero-1200.avif 1200w"
    sizes="(max-width: 600px) 100vw, 50vw"
  />
  <source
    type="image/webp"
    srcset="hero-400.webp 400w, hero-800.webp 800w, hero-1200.webp 1200w"
    sizes="(max-width: 600px) 100vw, 50vw"
  />
  <img
    src="hero-800.jpg"
    srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1200.jpg 1200w"
    sizes="(max-width: 600px) 100vw, 50vw"
    width="1200"
    height="600"
    alt="Hero"
    loading="lazy"
    decoding="async"
  />
</picture>
```

## CLS Prevention with `aspect-ratio`

When exact dimensions are unknown, use CSS `aspect-ratio` instead of `width`/`height`:

```html
<img src="photo.jpg" style="aspect-ratio: 4/3; width: 100%;" alt="Photo" />
```

## Embed Space Reservation

```html
<!-- Reserve space for ads/embeds -->
<div style="min-height: 250px;">
  <iframe src="https://ad-network.com/ad" height="250"></iframe>
</div>

<!-- Aspect-ratio container for video embeds -->
<div style="aspect-ratio: 16/9;">
  <iframe src="https://youtube.com/embed/..." style="width: 100%; height: 100%;"></iframe>
</div>
```

## SEO Image Guidelines

- Descriptive filenames with keywords (not `IMG_12345.jpg`)
- Alt text describes the image content, not the filename
- Compressed and sized for actual display dimensions
