# AI Responsive Failure Patterns

Specific, recurring mistakes that AI coding assistants make when generating responsive CSS. Each entry shows the bad output, why it breaks, and the correct pattern.

Scan AI-generated responsive code against this list before shipping.

---

## 1. 100vh on Mobile

```css
/* AI generates this almost universally */
.hero {
  height: 100vh;
}
```

`100vh` is calculated against the largest viewport (browser UI collapsed). On load with address bar visible, content overflows.

```css
/* Correct */
.hero {
  height: 100vh; /* fallback */
  height: 100svh; /* modern browsers */
}
```

Use `svh` for ~90% of cases. Use `dvh` only for elements that must track the exact visible area (chat containers, modals).

---

## 2. Desktop-First Media Queries

```css
/* AI trained on older code defaults to max-width */
.container {
  width: 1200px;
  display: flex;
}
@media (max-width: 1024px) {
  .container {
    width: 100%;
  }
}
@media (max-width: 768px) {
  .container {
    flex-direction: column;
  }
}
```

Mobile loads all desktop styles then overrides. At intermediate widths, rules fight.

```css
/* Mobile-first with min-width */
.container {
  padding: 1rem;
  display: flex;
  flex-direction: column;
}
@media (min-width: 768px) {
  .container {
    flex-direction: row;
    padding: 2rem;
  }
}
@media (min-width: 1024px) {
  .container {
    max-width: 1200px;
    margin: 0 auto;
  }
}
```

---

## 3. Missing min-width: 0 on Flex Children

```css
/* AI output — long text overflows */
.card {
  display: flex;
}
.card__title {
  overflow-wrap: break-word;
}
```

Default flex item `min-width` is `auto` (content size), not `0`. Long text won't shrink below its content width.

```css
.card__title {
  min-width: 0; /* allows flex item to shrink below content size */
  overflow-wrap: break-word;
}
```

This is invisible in DevTools unless content is dynamic (long usernames, URLs, translated text).

---

## 4. overflow: hidden Killing Sticky

```css
/* AI adds overflow: hidden for visual clipping */
.page-wrapper {
  overflow: hidden;
}
.sticky-header {
  position: sticky;
  top: 0;
} /* silently broken */
```

Any ancestor with `overflow: hidden/scroll/auto` creates a scroll container, intercepting sticky.

```css
/* Use overflow: clip instead — clips without creating scroll container */
.page-wrapper {
  overflow: clip;
}
```

---

## 5. transform Breaking Fixed Positioning

```css
/* AI adds transform for animation */
.animated-section {
  transform: translateY(0);
  transition: transform 0.3s;
}
.sticky-cta {
  position: fixed;
  bottom: 2rem;
} /* now fixed to .animated-section, not viewport */
```

Any `transform`, `filter`, `backdrop-filter`, `perspective`, `will-change: transform` on an ancestor creates a new containing block for `position: fixed` children.

---

## 6. iOS Input Zoom (Below 16px)

```css
/* AI generates this — triggers auto-zoom on iOS Safari */
input,
textarea {
  font-size: 14px;
}
```

iOS Safari auto-zooms the viewport when focusing an input with font-size below 16px. The page stays zoomed after leaving the field.

```css
input,
textarea,
select {
  font-size: max(16px, 1rem);
}
```

Don't suppress with `maximum-scale=1` in viewport meta — that prevents user-initiated zoom, violating accessibility guidelines.

---

## 7. Missing Safe Area Insets

```css
/* AI forgets notch/Dynamic Island/home indicator */
.fixed-header {
  position: fixed;
  top: 0;
}
.bottom-nav {
  position: fixed;
  bottom: 0;
}
```

```html
<!-- Required for env() to return non-zero values -->
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

Landscape orientation: notch moves to the side. `safe-area-inset-left/right` become significant. AI almost never handles landscape.

---

## 8. Z-Index Escalation

```css
/* AI generates escalating values */
.modal {
  z-index: 99999;
}
.tooltip {
  z-index: 999999;
}
```

This signals misunderstanding of stacking contexts. Properties that silently create stacking contexts (trapping z-index): `opacity < 1`, any `transform`, `filter`, `will-change`, `position: sticky/fixed`, `mix-blend-mode`, `clip-path`, `isolation: isolate`.

```css
/* Use isolation: isolate to deliberately contain stacking */
.modal {
  isolation: isolate;
}
.modal-overlay {
  z-index: 1;
}
.modal-content {
  z-index: 2;
}
```

---

## 9. Virtual Keyboard Displacing Fixed Elements

```css
/* AI output — chat input disappears under keyboard */
.chat-input {
  position: fixed;
  bottom: 0;
}
```

When the mobile keyboard opens, the visual viewport shrinks. Fixed elements at `bottom: 0` get pushed off-screen or overlap the keyboard.

```javascript
// iOS-compatible approach
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    document.documentElement.style.setProperty(
      "--keyboard-height",
      `${window.innerHeight - window.visualViewport.height}px`,
    );
  });
}
```

```css
.chat-input {
  position: fixed;
  bottom: var(--keyboard-height, 0);
}
```

---

## 10. display: none for Mobile/Desktop Variants

```html
<!-- AI duplicates content -->
<nav class="desktop-nav">...</nav>
<nav class="mobile-nav">...</nav>
```

Duplicate content: double the DOM, double the downloads. Screen readers may read both. Use one component that adapts:

```css
.nav {
  display: flex;
  flex-direction: column;
}
@media (min-width: 768px) {
  .nav {
    flex-direction: row;
  }
}
```

---

## 11. Images Without Dimensions (Layout Shift)

```html
<!-- AI omits width/height — browser can't reserve space -->
<img src="product.jpg" alt="Product" class="w-full" />
```

Without explicit width/height, the browser can't compute aspect ratio before load. Content shifts when the image appears.

```html
<img src="product.jpg" alt="Product" width="800" height="600" class="w-full h-auto" />
```

Don't use `width: auto` in CSS when HTML width/height attributes are set — it overrides the browser's aspect ratio calculation.

---

## 12. Missing align-self: start on Sticky in Flex/Grid

```css
/* AI puts sticky on a grid/flex child without this */
.sidebar {
  position: sticky;
  top: 0;
}
```

In flex/grid containers, children stretch to fill their row by default. The sidebar becomes as tall as the content — sticky has no room to "stick."

```css
.sidebar {
  position: sticky;
  top: 0;
  align-self: start; /* required */
}
```

---

## 13. Optimizing for One Viewport

AI generates code that looks perfect at 1440px and breaks everywhere else:

- **At 320px:** Fixed-width items overflow, absolutely positioned elements fall off-screen, padding consumes all space
- **At 768px portrait:** Two-column layouts look cramped; sidebar + main breaks awkwardly
- **At in-between sizes (843px, 900px):** Inherits desktop styles too early, content wasn't designed for that width
- **At ultrawide (1920px+):** No `max-width` on containers — lines become unreadably long (>80ch)

**Defensive defaults:**

```css
/* Always cap content width */
.content {
  max-width: min(1200px, calc(100% - 2rem));
  margin-inline: auto;
}

/* Fluid values prevent in-between breakage */
h1 {
  font-size: clamp(1.5rem, 4vw, 3rem);
}
.section {
  padding: clamp(1rem, 5vw, 4rem);
}
```

---

## Quick Scan Checklist

When reviewing AI-generated responsive code, check for:

- [ ] `height: 100vh` — replace with `svh`/`dvh` + `vh` fallback
- [ ] `max-width` media queries — indicates desktop-first
- [ ] Fixed pixel widths without `max-width` companion
- [ ] `flex` children without `min-width: 0` (when content could be dynamic)
- [ ] `overflow: hidden` on any parent of sticky/fixed element
- [ ] `position: fixed` inside `transform` parent
- [ ] Z-index values above 10 — probable stacking context confusion
- [ ] Input font-size below 16px — iOS zoom trigger
- [ ] Fixed bottom elements with no keyboard accommodation
- [ ] `env(safe-area-inset-*)` usage — needs `viewport-fit=cover` meta tag
- [ ] `display: none` for mobile/desktop component variants
- [ ] Images without `width`/`height` attributes
- [ ] No `box-sizing: border-box` global reset
- [ ] Missing `max-width` on content containers (ultrawide problem)
- [ ] `flex-wrap` missing on containers that should wrap
- [ ] `object-fit` missing on images in fixed-size containers
