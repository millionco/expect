# Runtime Performance Patterns

The parent rule covers layout thrashing, virtualization, debouncing, and passive listeners. This sub-rule covers **code patterns** for each.

## Layout Thrashing Fix

```javascript
// BAD — forces reflow on every iteration
elements.forEach((el) => {
  const height = el.offsetHeight;
  el.style.height = height + 10 + "px";
});

// GOOD — batch all reads, then all writes
const heights = elements.map((el) => el.offsetHeight);
elements.forEach((el, i) => {
  el.style.height = heights[i] + 10 + "px";
});
```

## Event Delegation

```javascript
// BAD — N listeners
items.forEach((item) => item.addEventListener("click", handleClick));

// GOOD — 1 listener
container.addEventListener("click", (event) => {
  if (event.target.matches(".item")) handleClick(event);
});
```

## Memory Cleanup with AbortController

```javascript
const controller = new AbortController();
window.addEventListener("resize", handler, { signal: controller.signal });
window.addEventListener("scroll", handler, { signal: controller.signal });

// Cleanup: removes both listeners
controller.abort();
```

## Third-Party Script Facade

Defer heavy embeds until user interaction:

```html
<div class="youtube-facade" data-video-id="abc123" onclick="loadYouTube(this)">
  <img src="/thumbnails/abc123.jpg" alt="Video title" />
  <button aria-label="Play video">&#9654;</button>
</div>
```
