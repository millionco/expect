# Deprecated APIs

## document.write

Blocks HTML parsing. Use dynamic DOM insertion instead.

```javascript
// BAD
document.write('<script src="..."><\/script>');

// GOOD
const script = document.createElement("script");
script.src = "...";
document.head.appendChild(script);
```

## Synchronous XHR

Blocks main thread. Use `fetch` or async XHR.

```javascript
// BAD
const xhr = new XMLHttpRequest();
xhr.open("GET", url, false); // synchronous

// GOOD
const response = await fetch(url);
```

## Application Cache

Replaced by Service Workers.

```javascript
// BAD
<html manifest="cache.manifest">

// GOOD
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

## Non-Passive Event Listeners

Touch and wheel listeners should be passive to allow smooth scrolling.

```javascript
// BAD — may block scrolling
element.addEventListener("touchstart", handler);
element.addEventListener("wheel", handler);

// GOOD — allows smooth scrolling
element.addEventListener("touchstart", handler, { passive: true });
element.addEventListener("wheel", handler, { passive: true });

// If you need preventDefault, be explicit
element.addEventListener("touchstart", handler, { passive: false });
```

## Mutation Events

`DOMSubtreeModified`, `DOMNodeInserted`, etc. are deprecated. Use `MutationObserver`.

```javascript
// BAD
element.addEventListener("DOMSubtreeModified", handler);

// GOOD
const observer = new MutationObserver(handler);
observer.observe(element, { childList: true, subtree: true });
```
