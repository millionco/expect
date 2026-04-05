# Core Web Vitals Debugging

The parent rule covers thresholds and optimization checklists. This sub-rule covers **debugging and measurement** — how to identify what's wrong and verify fixes.

## Identify the LCP Element

```javascript
new PerformanceObserver((list) => {
  const entries = list.getEntries();
  const last = entries[entries.length - 1];
  console.log("LCP element:", last.element, "LCP time:", last.startTime);
}).observe({ type: "largest-contentful-paint", buffered: true });
```

Common LCP elements: hero image, large text block, background image, `<canvas>`.

## INP Breakdown

Total INP = Input Delay (< 50ms) + Processing Time (< 100ms) + Presentation Delay (< 50ms).

**Find slow interactions:**

```javascript
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 200) {
      console.warn("Slow interaction:", {
        type: entry.name,
        duration: entry.duration,
        processingStart: entry.processingStart,
        processingEnd: entry.processingEnd,
        target: entry.target,
      });
    }
  }
}).observe({ type: "event", buffered: true, durationThreshold: 16 });
```

**Yielding to break long tasks:**

```javascript
const processLargeArray = async (items) => {
  const CHUNK_SIZE = 100;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    items.slice(i, i + CHUNK_SIZE).forEach(expensiveOperation);
    await new Promise((r) => setTimeout(r, 0));
  }
};
```

## CLS Attribution

```javascript
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) {
      console.log("Shift:", entry.value);
      entry.sources?.forEach((s) =>
        console.log("  Element:", s.node, s.previousRect, "→", s.currentRect),
      );
    }
  }
}).observe({ type: "layout-shift", buffered: true });
```

## Field Data Collection

```javascript
import { onLCP, onINP, onCLS } from "web-vitals";

const sendToAnalytics = ({ name, value, rating }) => {
  gtag("event", name, {
    event_category: "Web Vitals",
    value: Math.round(name === "CLS" ? value * 1000 : value),
    event_label: rating,
  });
};

onLCP(sendToAnalytics);
onINP(sendToAnalytics);
onCLS(sendToAnalytics);
```
