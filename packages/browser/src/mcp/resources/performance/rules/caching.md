# Caching Strategy

## Cache-Control Headers

```
# HTML — short or no cache
Cache-Control: no-cache, must-revalidate

# Hashed static assets — immutable
Cache-Control: public, max-age=31536000, immutable

# Static assets without hash
Cache-Control: public, max-age=86400, stale-while-revalidate=604800

# API responses
Cache-Control: private, max-age=0, must-revalidate
```

## Service Worker Caching

```javascript
// Cache-first for static assets
self.addEventListener("fetch", (event) => {
  if (["image", "style", "script"].includes(event.request.destination)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open("static-v1").then((cache) => cache.put(event.request, clone));
            return response;
          }),
      ),
    );
  }
});
```

## Server Response

- **TTFB < 800ms** — CDN, edge caching, efficient backends
- **Brotli compression** — 15-20% smaller than gzip for text assets
- **HTTP/2 or HTTP/3** — multiplexing reduces connection overhead
- **Edge caching** — cache HTML at CDN edge when possible
