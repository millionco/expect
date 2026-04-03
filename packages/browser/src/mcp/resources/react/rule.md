---
name: react-best-practices
description: React and Next.js performance optimization guidelines. Use when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements.
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# React Best Practices

59 rules across 9 categories. Fetch `expect://rules/react/<sub-rule>` for details.

## 1. Eliminating Waterfalls (CRITICAL)

- [ ] Move `await` into branches where actually used (`async-defer-await`)
- [ ] Use `Promise.all()` for independent operations (`async-parallel`)
- [ ] Use better-all for partial dependencies (`async-dependencies`)
- [ ] Start promises early, await late in API routes (`async-api-routes`)
- [ ] Use Suspense to stream content (`async-suspense-boundaries`)

## 2. Bundle Size (CRITICAL)

- [ ] Import directly, avoid barrel files (`bundle-barrel-imports`)
- [ ] Use `next/dynamic` for heavy components (`bundle-dynamic-imports`)
- [ ] Load analytics/logging after hydration (`bundle-defer-third-party`)
- [ ] Load modules only when feature activated (`bundle-conditional`)
- [ ] Preload on hover/focus for perceived speed (`bundle-preload`)

## 3. Server-Side Performance (HIGH)

- [ ] Authenticate server actions like API routes (`server-auth-actions`)
- [ ] `React.cache()` for per-request dedup (`server-cache-react`)
- [ ] LRU cache for cross-request caching (`server-cache-lru`)
- [ ] Avoid duplicate serialization in RSC props (`server-dedup-props`)
- [ ] Hoist static I/O to module level (`server-hoist-static-io`)
- [ ] Minimize data passed to client components (`server-serialization`)
- [ ] Restructure components to parallelize fetches (`server-parallel-fetching`)
- [ ] Use `after()` for non-blocking operations (`server-after-nonblocking`)

## 4. Client-Side Data Fetching (MEDIUM-HIGH)

- [ ] SWR for automatic request dedup (`client-swr-dedup`)
- [ ] Deduplicate global event listeners (`client-event-listeners`)
- [ ] Passive listeners for scroll (`client-passive-event-listeners`)
- [ ] Version and minimize localStorage data (`client-localstorage-schema`)

## 5. Re-render Optimization (MEDIUM)

- [ ] Don't subscribe to state only used in callbacks (`rerender-defer-reads`)
- [ ] Extract expensive work into memoized components (`rerender-memo`)
- [ ] Hoist default non-primitive props (`rerender-memo-with-default-value`)
- [ ] Use primitive dependencies in effects (`rerender-dependencies`)
- [ ] Subscribe to derived booleans, not raw values (`rerender-derived-state`)
- [ ] Derive state during render, not effects (`rerender-derived-state-no-effect`)
- [ ] Functional setState for stable callbacks (`rerender-functional-setstate`)
- [ ] Pass function to useState for expensive init (`rerender-lazy-state-init`)
- [ ] Avoid memo for simple primitives (`rerender-simple-expression-in-memo`)
- [ ] Put interaction logic in event handlers (`rerender-move-effect-to-event`)
- [ ] `startTransition` for non-urgent updates (`rerender-transitions`)
- [ ] Refs for transient frequent values (`rerender-use-ref-transient-values`)

## 6. Rendering Performance (MEDIUM)

- [ ] Animate div wrapper, not SVG element (`rendering-animate-svg-wrapper`)
- [ ] `content-visibility` for long lists (`rendering-content-visibility`)
- [ ] Extract static JSX outside components (`rendering-hoist-jsx`)
- [ ] Reduce SVG coordinate precision (`rendering-svg-precision`)
- [ ] Inline script for client-only data (`rendering-hydration-no-flicker`)
- [ ] Suppress expected hydration mismatches (`rendering-hydration-suppress-warning`)
- [ ] Activity component for show/hide (`rendering-activity`)
- [ ] Ternary, not `&&` for conditionals (`rendering-conditional-render`)
- [ ] `useTransition` for loading state (`rendering-usetransition-loading`)

## 7. JavaScript Performance (LOW-MEDIUM)

- [ ] Group CSS changes via classes/cssText (`js-batch-dom-css`)
- [ ] Build Map for repeated lookups (`js-index-maps`)
- [ ] Cache object properties in loops (`js-cache-property-access`)
- [ ] Cache function results in module-level Map (`js-cache-function-results`)
- [ ] Cache localStorage/sessionStorage reads (`js-cache-storage`)
- [ ] Combine multiple filter/map into one loop (`js-combine-iterations`)
- [ ] Check array length before expensive comparison (`js-length-check-first`)
- [ ] Return early from functions (`js-early-exit`)
- [ ] Hoist RegExp creation outside loops (`js-hoist-regexp`)
- [ ] Loop for min/max instead of sort (`js-min-max-loop`)
- [ ] Set/Map for O(1) lookups (`js-set-map-lookups`)
- [ ] `toSorted()` for immutability (`js-tosorted-immutable`)

## 8. Advanced Patterns (LOW)

- [ ] Store event handlers in refs (`advanced-event-handler-refs`)
- [ ] Initialize app once per load (`advanced-init-once`)
- [ ] `useLatest` for stable callback refs (`advanced-use-latest`)

## 9. React Patterns (PROJECT)

- [ ] Never call `useEffect` directly; use derived state, event handlers, or `useMountEffect` (`no-use-effect`)
