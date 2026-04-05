# HTML Quality Patterns

## Valid HTML

```html
<!-- BAD — duplicate IDs -->
<div id="header"></div>
<div id="header"></div>

<!-- BAD — invalid child -->
<ul>
  <div>Item</div>
</ul>

<!-- BAD — invalid nesting (interactive inside interactive) -->
<a href="/"><button>Click</button></a>

<!-- GOOD -->
<header id="site-header"></header>
<ul>
  <li>Item</li>
</ul>
<a href="/" class="button">Click</a>
```

## Semantic HTML

```html
<!-- BAD — div soup -->
<div class="header">
  <div class="nav"><div class="nav-item">Home</div></div>
</div>

<!-- GOOD — semantic elements -->
<header>
  <nav><a href="/">Home</a></nav>
</header>
<main>
  <article><h1>Headline</h1></article>
</main>
```

Landmarks: `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>`.

## Image Aspect Ratios

```html
<!-- BAD — distorted (actual ratio is 4:3) -->
<img src="photo.jpg" width="300" height="100" />

<!-- GOOD — matches actual ratio -->
<img src="photo.jpg" width="300" height="225" />

<!-- GOOD — CSS object-fit for flexible containers -->
<img src="photo.jpg" style="width: 300px; height: 200px; object-fit: cover;" />
```

## Error Handling

```javascript
window.addEventListener("error", (event) => {
  errorTracker.captureException(event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  errorTracker.captureException(event.reason);
});
```
