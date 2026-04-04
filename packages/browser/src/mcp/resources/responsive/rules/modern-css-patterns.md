# Modern CSS Responsive Patterns

The CSS responsive toolkit as of 2026. Organized by the three-layer model: fluid values, container-level, then viewport-level.

## Framework Detection

Before applying patterns, check what CSS approach the project uses:

- **Tailwind CSS** — Use Tailwind's responsive modifiers, `@container` variants, and `@theme` tokens. See the Tailwind mapping notes throughout this file.
- **CSS-in-JS** (styled-components, Emotion) — Same patterns, expressed through the library's API (template literals, responsive props).
- **Component library** (MUI, Chakra, shadcn) — Use the library's responsive system (Chakra's responsive prop objects, MUI's `sx` breakpoint syntax). Don't fight it with raw media queries.
- **Vanilla CSS / CSS Modules** — Apply patterns directly.

**When the project uses Tailwind,** output Tailwind classes, not raw CSS. Each section below includes Tailwind equivalents where relevant.

---

## Layer 1: Fluid Values (No Breakpoints Needed)

### clamp() for Typography and Spacing

`clamp(min, preferred, max)` scales continuously between two bounds. Eliminates most font-size and spacing breakpoints.

**The formula** (slope-intercept, used by Utopia):

```
slope = (maxSize - minSize) / (maxViewport - minViewport)   [all in rem]
intercept = -(minViewport * slope) + minSize

Result: clamp(minSize, intercept + slope * 100vw, maxSize)
```

**Worked example** — heading from 1.5rem at 360px to 3rem at 1200px:

```css
/* 
  minVw = 360/16 = 22.5rem, maxVw = 1200/16 = 75rem
  slope = (3 - 1.5) / (75 - 22.5) = 0.02857
  intercept = -(22.5 * 0.02857) + 1.5 = 0.857
*/
font-size: clamp(1.5rem, 0.857rem + 2.857vw, 3rem);
```

**Utopia fluid type scale** — generate a harmonious set at [utopia.fyi](https://utopia.fyi):

```css
:root {
  --step--1: clamp(0.83rem, 0.78rem + 0.29vw, 1rem);
  --step-0: clamp(1rem, 0.91rem + 0.43vw, 1.25rem);
  --step-1: clamp(1.2rem, 1.07rem + 0.63vw, 1.56rem);
  --step-2: clamp(1.44rem, 1.26rem + 0.89vw, 1.95rem);
  --step-3: clamp(1.73rem, 1.48rem + 1.24vw, 2.44rem);
  --step-4: clamp(2.07rem, 1.73rem + 1.7vw, 3.05rem);
}
```

**Fluid spacing** — same approach, semantic names:

```css
:root {
  --space-s: clamp(0.75rem, 0.69rem + 0.29vw, 0.875rem);
  --space-m: clamp(1rem, 0.93rem + 0.38vw, 1.25rem);
  --space-l: clamp(1.5rem, 1.38rem + 0.57vw, 1.75rem);
  --space-xl: clamp(2rem, 1.86rem + 0.71vw, 2.5rem);
  --space-section: clamp(3rem, 8vw, 6rem);
}
```

**Accessibility rule:** Always combine `rem + vw` in the preferred value — never pure `vw`. The `rem` component respects browser zoom; pure `vw` doesn't scale when users zoom to 200%. If `max / min <= 2.5`, it passes WCAG SC 1.4.4.

**When NOT to use clamp():**

- Button labels and UI chrome (should be consistent, not scaling)
- Text in containers where predictable wrapping matters
- Legal/compliance copy requiring fixed sizing

### Intrinsic Sizing (No Queries at All)

**Self-adjusting grid:**

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: var(--space-m);
}
```

The `min(280px, 100%)` prevents overflow on viewports narrower than 280px.

**`auto-fit` vs `auto-fill`** — Claude frequently confuses these:

- `auto-fit` — collapses empty tracks, stretching items to fill the row. Use when you want items to grow into available space.
- `auto-fill` — keeps empty tracks, leaving gaps at the end. Use when you want consistent item widths even with few items.

Most responsive grids want `auto-fit`. Use `auto-fill` only when items should maintain a fixed max width regardless of available space.

**Tailwind:** `grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))]` or use arbitrary grid values. For simpler grids: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

**Sidebar layout without breakpoints** (Every Layout pattern):

```css
.layout {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-l);
}
.sidebar {
  flex-basis: 20rem;
  flex-grow: 1;
  min-width: 0;
}
.main {
  flex-basis: 0;
  flex-grow: 999;
  min-width: min(60%, 30rem);
}
```

When container is too narrow for both, they wrap naturally.

---

## Layer 2: Container Queries (Component-Level)

### Core Syntax

```css
/* Establish container */
.card-wrapper {
  container-type: inline-size;
  container-name: card;
  /* shorthand: container: card / inline-size; */
}

/* Query it */
@container card (width > 400px) {
  .card {
    display: grid;
    grid-template-columns: 200px 1fr;
  }
}
```

### container-type Values

| Value         | Enables                | Use when                                |
| ------------- | ---------------------- | --------------------------------------- |
| `inline-size` | Width queries          | **Default choice** — 95% of cases       |
| `size`        | Width + height queries | Dashboard widgets with fixed dimensions |
| `normal`      | Style queries only     | CSS custom property-based queries       |

Avoid `size` unless you need height queries — it requires explicit height and can create layout loops.

### Container Query Units

| Unit    | Definition                                   |
| ------- | -------------------------------------------- |
| `cqi`   | 1% of container's inline size (width in LTR) |
| `cqb`   | 1% of container's block size                 |
| `cqmin` | Smaller of cqi or cqb                        |
| `cqmax` | Larger of cqi or cqb                         |

Prefer `cqi`/`cqb` over `cqw`/`cqh` — they're writing-mode aware.

**Fluid sizing inside containers:**

```css
.card__title {
  font-size: clamp(1rem, 1.5cqi + 0.5rem, 1.75rem);
}
```

### Container Queries vs Media Queries

| Use case                                          | Tool            |
| ------------------------------------------------- | --------------- |
| Component layout (card, widget, nav item)         | Container query |
| Page structure (grid columns, sidebar visibility) | Media query     |
| Device orientation, user preferences, print       | Media query     |
| Reusable component in different contexts          | Container query |

**Tailwind container queries** (built-in, no plugin):

```html
<div class="@container">
  <div class="flex flex-col @md:flex-row @lg:grid @lg:grid-cols-3">...</div>
</div>
```

Tailwind's `@` breakpoints are smaller than viewport breakpoints (`@md` = 448px vs `md` = 768px). Use named containers for nested contexts: `@container/sidebar` → `@sm/sidebar:hidden`.

### Critical Gotchas

**A container cannot query itself.** Only children respond to the container's size. You may need a wrapper element.

**Container query units can't be used on the container element itself:**

```css
/* INVALID */
.card {
  container-type: inline-size;
  padding: 10cqi;
}

/* VALID — on children */
.card > * {
  padding: 10cqi;
}
```

**Custom properties don't work in container query conditions:**

```css
/* Does NOT work */
@container (min-width: var(--breakpoint)) {
}
```

**Flex items that are also containers may collapse** without explicit sizing. Set `min-width: 0` or `flex: 1`.

**Grid items:** Don't make grid items containers directly — wrap them in a div.

### Browser Support

Container size queries: Chrome 105+, Firefox 110+, Safari 16+. ~95% global coverage. Production-ready.

Style queries (`@container style(--var: val)`): Chrome/Edge only. Use as progressive enhancement.

---

## Layer 3: Viewport Media Queries (Page-Level)

Still the right tool for:

- Global layout shifts (sidebar appears/disappears, column count changes)
- `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast`
- Print stylesheets
- Device orientation
- Input method detection

**Tailwind viewport breakpoints:** `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px), `2xl:` (1536px). All mobile-first (`min-width`). Range targeting: `md:max-xl:flex`. Arbitrary: `min-[320px]:text-center`.

### Input Method Detection

```css
@media (pointer: fine) {
  /* mouse/trackpad */
}
@media (pointer: coarse) {
  /* touch/stylus */
}
@media (hover: hover) {
  /* device supports hover */
}
@media (hover: none) {
  /* touch devices — never gate functionality on hover */
}
```

### Safe Areas (Notched Devices)

```html
<!-- Required in <head> -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

```css
.fixed-header {
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
.bottom-nav {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

Landscape: the notch moves to the side — `safe-area-inset-left`/`right` become significant.

### Responsive Images

Don't make mobile load a 2400px desktop hero image. Use `srcset` for resolution switching and `<picture>` for art direction.

**Resolution switching** (same image, different sizes):

```html
<img
  src="hero-800.jpg"
  srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1200.jpg 1200w, hero-2400.jpg 2400w"
  sizes="(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 1200px"
  alt="Hero image"
  width="2400"
  height="1200"
  loading="lazy"
/>
```

`sizes` tells the browser how wide the image will display at each viewport, so it picks the smallest `srcset` that covers that width at the device's pixel density.

**Art direction** (different crops per viewport):

```html
<picture>
  <source media="(max-width: 640px)" srcset="hero-mobile.jpg" />
  <source media="(max-width: 1024px)" srcset="hero-tablet.jpg" />
  <img src="hero-desktop.jpg" alt="Hero" width="2400" height="1200" />
</picture>
```

Use `<picture>` when the mobile image should be a different crop or composition — not just a smaller version.

**Always include:**

- `width` and `height` attributes (prevents layout shift)
- `loading="lazy"` on below-fold images
- `alt` text

**Tailwind:** `object-cover` for images in fixed containers. No built-in srcset — use raw HTML attributes alongside Tailwind classes.

---

## Modern Viewport Units

### The 100vh Problem

Mobile browsers have dynamic UI (address bar). `100vh` is calculated against the largest viewport (UI collapsed). On page load with address bar visible, content overflows.

### The Three Families

| Unit  | Sized with browser UI...    | Use for                                                             |
| ----- | --------------------------- | ------------------------------------------------------------------- |
| `svh` | Fully expanded (smallest)   | **Default** — hero sections, modals, anything that must fit on load |
| `lvh` | Fully retracted (largest)   | Backgrounds, decorative elements                                    |
| `dvh` | Dynamic — updates on scroll | Sparingly — chat interfaces, overlays that must fill exact space    |

**Always provide a `vh` fallback:**

```css
.hero {
  height: 100vh; /* fallback */
  height: 100svh; /* modern browsers */
}
```

**Avoid `dvh` for primary layout** — it causes layout recalculation on scroll as the browser toolbar animates. Use `svh` for ~90% of cases.

Browser support: All three families baseline available since June 2025. ~95% coverage.

---

## CSS Subgrid

Solves cross-component alignment in grids. Before subgrid, nested elements couldn't participate in the parent grid's tracks.

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  grid-template-rows: auto 1fr auto; /* image, body, cta */
}

.card {
  grid-row: span 3; /* span all row tracks */
  display: grid;
  grid-template-rows: subgrid; /* inherit parent's row tracks */
}
```

Now card titles, bodies, and CTAs align across sibling cards regardless of content length.

**Key gotcha:** Must explicitly declare `grid-row: span N` where N matches the number of parent tracks. Without it, the card occupies one row and subgrid has no tracks to inherit.

Browser support: Chrome 117+, Firefox 71+, Safari 16+. ~97% coverage. Production-ready.

---

## :has() for Content-Conditional Layouts

Style elements based on their descendants or state — without JavaScript.

```css
/* Card with image gets horizontal layout */
.card:has(.card__image) {
  grid-template-columns: 200px 1fr;
}

/* Layout adapts to sidebar presence */
.layout:has(.sidebar) {
  grid-template-columns: 1fr 300px;
}

/* Form row highlights when input is invalid */
.form-row:has(input:invalid) {
  border-color: red;
}
```

**:has() responds to content/state. Container queries respond to available space.** They solve different problems and complement each other.

Browser support: Chrome 105+, Safari 15.4+, Firefox 121+. ~95% coverage.

---

## Scroll-Driven Animations

Drive CSS animations with scroll position instead of time. No JavaScript scroll listeners.

**Scroll progress** — animation tied to scroll position:

```css
.progress-bar {
  animation: grow linear;
  animation-timeline: scroll(root block);
}
@keyframes grow {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
```

**View progress** — animation tied to element visibility:

```css
.section {
  animation: fade-up linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 40%;
}
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(2rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Only animate GPU-composited properties** (`transform`, `opacity`, `filter`). Others cause jank.

**Always gate behind reduced motion:**

```css
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: scroll()) {
    .element {
      animation: my-anim linear both;
      animation-timeline: view();
    }
  }
}
```

Browser support: Chrome 116+, Edge 116+. Safari 18+ has partial support (behind flag). Firefox not yet. **Progressive enhancement only** — always provide a static fallback.

---

## CSS Nesting

Co-locate responsive styles with their component:

```css
.card {
  padding: 0.5rem;
  display: block;

  @media (width >= 600px) {
    padding: 1rem;
  }

  @container card (width > 400px) {
    display: grid;
    grid-template-columns: 200px 1fr;
  }

  &:hover {
    transform: translateY(-2px);
  }
}
```

**Cannot do BEM concatenation** (unlike Sass): `&__element` does NOT create `.card__element`. Write the full class.

Browser support: Chrome 112+, Firefox 117+, Safari 17.2+. ~93% coverage.

---

## @layer (Cascade Layers)

Declare explicit priority order for style groups:

```css
@layer reset, base, layout, components, utilities;
```

Later layers win over earlier ones. Unlayered styles always beat layered styles.

**Keep responsive overrides in the same layer as the component:**

```css
@layer components {
  .nav {
    flex-direction: column;
  }
  @media (width >= 900px) {
    .nav {
      flex-direction: row;
    }
  }
}
```

Browser support: Chrome 99+, Firefox 97+, Safari 15.4+. ~97% coverage.

---

## Logical Properties

Layout in terms of content flow (inline/block) rather than physical direction (left/right/top/bottom). Automatically adapts to RTL and vertical writing modes.

| Physical             | Logical             |
| -------------------- | ------------------- |
| `width`              | `inline-size`       |
| `height`             | `block-size`        |
| `margin-left/right`  | `margin-inline`     |
| `margin-top/bottom`  | `margin-block`      |
| `padding-left/right` | `padding-inline`    |
| `top/bottom`         | `inset-block`       |
| `left/right`         | `inset-inline`      |
| `text-align: left`   | `text-align: start` |

```css
.article {
  max-inline-size: 65ch;
  padding-inline: var(--space-m);
  margin-inline: auto;
}
.pull-quote {
  border-inline-start: 4px solid var(--accent);
  padding-inline-start: 1rem;
}
```

Fully supported in all browsers. Adoption pays off most on multilingual projects; for LTR-only it's future-proofing.

---

## The Complete Decision Tree

```
Does this need to change layout?
  No  --> clamp() for sizing. Done.
  Yes --> Does it depend on CONTAINER size?
    Yes --> Container query
    No  --> Does it depend on VIEWPORT?
      Yes --> Media query (page-level only)
      No  --> Does it depend on CONTENT/STATE?
        Yes --> :has() or intrinsic sizing (auto-fit, flex-wrap)
```
