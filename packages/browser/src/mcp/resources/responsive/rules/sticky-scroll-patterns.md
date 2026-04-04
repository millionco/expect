# Sticky & Scroll Patterns

Complex scroll-based layout patterns and their responsive considerations. These are where responsive design breaks hardest — they need explicit patterns, not intuition.

---

## Multiple Sticky Elements

When a page has sticky header + sticky subnav + sticky sidebar, they need coordinated offsets and z-index management.

### Stacking Multiple Sticky Elements

Use CSS custom properties so `top` offsets auto-update at breakpoints:

```css
:root {
  --header-height: 60px;
  --subnav-height: 40px;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  height: var(--header-height);
}

.subnav {
  position: sticky;
  top: var(--header-height);
  z-index: 90;
  height: var(--subnav-height);
}

.table-header {
  position: sticky;
  top: calc(var(--header-height) + var(--subnav-height));
  z-index: 80;
}

.sidebar {
  position: sticky;
  top: calc(var(--header-height) + 1rem);
  align-self: start; /* CRITICAL — see below */
  height: fit-content;
}
```

**Responsive breakpoint updates — mobile-first, change one variable, everything adjusts:**

```css
/* Mobile base values */
:root {
  --header-height: 52px;
  --subnav-height: 0px; /* subnav is a dropdown on mobile */
}

@media (min-width: 769px) {
  :root {
    --header-height: 60px;
    --subnav-height: 40px;
  }
}
```

### The align-self: start Rule

**This is the single most missed sticky detail.** In flex and grid containers, children stretch to fill their row by default. A sidebar that stretches to full height is already as tall as the content — sticky has no room to "stick" because the element never scrolls past the viewport.

```css
/* Without this, sticky sidebar silently fails in flex/grid */
.sidebar {
  position: sticky;
  top: var(--header-height);
  align-self: start; /* required */
}
```

### Z-Index Scale

Use a tiered scale — don't escalate arbitrarily:

```css
:root {
  --z-sticky: 100;
  --z-subnav: 90;
  --z-sidebar: 80;
  --z-drawer: 200;
  --z-modal: 300;
  --z-toast: 400;
}
```

---

## Sticky Failures — Debugging Guide

`position: sticky` fails silently. When it doesn't work, check this list in order:

1. **overflow on any ancestor** — Any parent with `overflow: hidden`, `overflow: scroll`, or `overflow: auto` intercepts sticky. Use `overflow: clip` instead if you need visual clipping without creating a scroll container.

2. **No defined height on scroll container** — The parent must have height so there's room for the element to stick within.

3. **No inset property** — `top`, `bottom`, `left`, or `right` must be set to a non-`auto` value.

4. **Element is as tall as its container** — Happens in flex/grid without `align-self: start`. The element is already filling the space, so there's nothing to "stick."

5. **Stacking context traps** — `transform`, `filter`, `opacity < 1`, `will-change`, `isolation: isolate` on an ancestor creates a new stacking context. Sticky still works, but z-index is trapped within that context.

6. **`transform` on parent breaks `position: fixed` children** — Not sticky, but often confused with it. Any `transform` on an ancestor makes `fixed` children position relative to that ancestor, not the viewport.

---

## Scroll-Snap Layouts

### Horizontal Carousel with Snap

```css
.carousel {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain; /* prevents triggering browser back gesture */
  scrollbar-width: none;
}

.carousel-item {
  flex: 0 0 85%; /* each item takes 85% of container */
  scroll-snap-align: start;
  scroll-snap-stop: always; /* prevents swiping through multiple */
}
```

### Full-Page Scroll-Snap

```css
html {
  scroll-snap-type: y mandatory;
}
section {
  height: 100dvh; /* dvh, not vh, for mobile */
  scroll-snap-align: start;
}
```

### Responsive Snap — Different Behavior Per Breakpoint

```css
/* Mobile: horizontal scroll carousel */
.card-row {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  gap: 1rem;
  padding: 0 1rem;
}
.card {
  flex: 0 0 80vw;
  scroll-snap-align: start;
}

/* Desktop: standard grid, no snap */
@media (min-width: 768px) {
  .card-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    overflow-x: visible;
    scroll-snap-type: none;
  }
  .card {
    flex: none;
    width: auto;
  }
}
```

### Mandatory vs Proximity

- `mandatory` — always snaps. Can trap users if snap points are far apart. Only use when items fit the viewport.
- `proximity` — snaps only when close to a snap point. Safer for variable-height content.

### scroll-padding for Sticky Header Offset

```css
.scroll-container {
  scroll-snap-type: y mandatory;
  scroll-padding-top: var(--header-height);
}
```

---

## Independent Scroll Regions

Dashboard layouts where sidebar and main content scroll independently.

### The CSS Grid + Overflow Pattern

```css
body {
  display: grid;
  grid-template-areas:
    "header header"
    "sidebar main";
  grid-template-rows: var(--header-height) 1fr;
  grid-template-columns: 260px 1fr;
  height: 100dvh;
  margin: 0;
  overflow: hidden; /* all scrolling is within regions */
}

header {
  grid-area: header;
}
.sidebar {
  grid-area: sidebar;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.main {
  grid-area: main;
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

**`overscroll-behavior: contain`** is critical — without it, reaching the end of one scroll region chains to the parent (body scroll).

### Responsive: Mobile-First (Single Column Base, Grid at Desktop)

Write the mobile layout as the base, add the grid at larger viewports:

```css
/* Mobile base: single column, normal scroll */
body {
  margin: 0;
}
.sidebar {
  display: none; /* replaced by drawer/bottom-nav on mobile */
}

/* Desktop: multi-region dashboard */
@media (min-width: 769px) {
  body {
    display: grid;
    grid-template-areas: "header header" "sidebar main";
    grid-template-rows: var(--header-height) 1fr;
    grid-template-columns: 260px 1fr;
    height: 100dvh;
    overflow: hidden;
  }
  .sidebar {
    display: block;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .main {
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
```

---

## Sticky + Responsive Transitions

Elements that are sticky on desktop but flow normally on mobile.

### Sidebar: Sticky on Desktop, Inline on Mobile

```css
.toc {
  position: relative; /* mobile: flows normally */
}

@media (min-width: 1024px) {
  .layout {
    display: grid;
    grid-template-columns: 1fr 280px;
    align-items: start;
  }
  .toc {
    position: sticky;
    top: calc(var(--header-height) + 1rem);
    max-height: calc(100dvh - var(--header-height) - 2rem);
    overflow-y: auto;
    align-self: start;
  }
}
```

### Header That Changes Height Across Breakpoints

```css
:root {
  --header-height: 52px;
}
@media (min-width: 768px) {
  :root {
    --header-height: 72px;
  }
}
@media (min-width: 1200px) {
  :root {
    --header-height: 80px;
  }
}

/* All elements that account for header height auto-update */
[id] {
  scroll-margin-top: calc(var(--header-height) + 1rem);
}
```

### Sidebar Becomes Top Bar on Mobile

```css
/* Mobile: horizontal tab bar */
.sidebar {
  display: flex;
  flex-direction: row;
  overflow-x: auto;
  position: sticky;
  top: var(--header-height);
}

/* Desktop: vertical sidebar */
@media (min-width: 1024px) {
  .sidebar {
    display: block;
    position: sticky;
    top: calc(var(--header-height) + 1rem);
    overflow-x: visible;
    overflow-y: auto;
  }
}
```

---

## scroll-margin and scroll-padding

For anchor links with sticky headers — prevents content from hiding behind the header.

### On Target Elements

```css
[id] {
  scroll-margin-top: calc(var(--header-height) + 1rem);
}
```

### On the Scroll Container

```css
html {
  scroll-padding-top: calc(var(--header-height) + var(--subnav-height, 0px) + 1rem);
}
```

**Use `scroll-padding`** when all anchors are in the same container with a consistent offset. **Use `scroll-margin`** when different elements need different offsets.

---

## IntersectionObserver: Detecting Sticky "Stuck" State

CSS has no `:stuck` pseudo-class. Use a zero-height sentinel element:

```html
<div class="sticky-sentinel" aria-hidden="true"></div>
<header class="site-header">...</header>
```

```css
.sticky-sentinel {
  position: absolute;
  height: 1px;
  top: 0;
  left: 0;
  right: 0;
  pointer-events: none;
}
```

```javascript
const sentinel = document.querySelector(".sticky-sentinel");
const header = document.querySelector(".site-header");

const observer = new IntersectionObserver(
  ([entry]) => {
    header.classList.toggle("is-stuck", !entry.isIntersecting);
  },
  { threshold: 0 },
);
observer.observe(sentinel);
```

```css
.site-header.is-stuck {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(8px);
}
```

Always `observer.disconnect()` in component cleanup.

---

## Sticky Table Headers (Dual-Axis Sticky)

When a data table needs both a sticky header row AND a sticky first column:

```css
.table-wrapper {
  overflow-x: auto;
  overflow-y: auto;
  max-height: 400px;
}

thead th {
  position: sticky;
  top: 0;
  background: white;
  z-index: 20;
}

.col-sticky {
  position: sticky;
  left: 0;
  background: white;
  z-index: 10;
}

/* The corner cell — highest z-index */
thead th.col-sticky {
  z-index: 30;
}
```

The **sticky corner cell z-index** is almost always forgotten. Without it, the header or column covers the corner when scrolling both directions.

Always wrap in `role="region"` with `aria-label` and `tabindex="0"` for keyboard scrolling.

For full responsive data table patterns (card layout, column hiding), see `references/responsive-design-forks.md` Fork 2.

---

## Responsive Modals / Bottom Sheets

### Desktop Modal to Mobile Bottom Sheet (Native `<dialog>`)

```css
/* Mobile base: bottom sheet */
dialog {
  border: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  margin: 0;
  width: 100%;
  border-radius: 20px 20px 0 0;
  padding: 1.5rem;
  padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
  max-height: 85dvh;
  overflow-y: auto;
}

/* Desktop: centered modal */
@media (min-width: 641px) {
  dialog {
    position: relative;
    bottom: auto;
    left: auto;
    right: auto;
    margin: auto;
    max-width: 480px;
    width: 90%;
    border-radius: 12px;
    padding: 2rem;
    padding-bottom: 2rem;
    max-height: none;
    overflow-y: visible;
  }
}
```

Use `showModal()` — provides built-in focus trap, Esc to close, `aria-modal="true"`.

### Drawer Navigation

```css
.drawer {
  position: fixed;
  top: 0;
  left: 0;
  height: 100dvh;
  width: min(320px, 85vw);
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.drawer.is-open {
  transform: translateX(0);
}
```
