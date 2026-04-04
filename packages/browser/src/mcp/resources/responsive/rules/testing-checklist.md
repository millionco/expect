# Responsive Testing Checklist

How to verify responsive design without a visual canvas. Organized from fastest to most thorough.

---

## The Drag-Resize Habit

The single most valuable responsive testing technique: in Chrome DevTools device mode (`Cmd+Shift+M`), set to Responsive (not a preset device), then slowly drag the right handle from 280px to 2560px.

**Don't jump between breakpoints — drag continuously.** This catches:

- Content overflow at widths between breakpoints
- Text collision and wrapping issues
- Layout collapse at unexpected widths
- Elements that look fine at 768px but break at 900px

---

## Media Query Visualization (Underused DevTools Feature)

In device toolbar: More Options > Show Media Queries. Chrome draws color-coded bars:

- Orange = `min-width` queries (mobile-first)
- Blue = `max-width` queries (desktop-first)
- Green = range queries

Click bars to jump to that breakpoint. Right-click to see the rule in source.

---

## Priority Viewport Widths

Ranked by 2026 device market share and likelihood of catching issues:

| Priority | Width  | Represents                                     |
| -------- | ------ | ---------------------------------------------- |
| 1        | 390px  | iPhone 12-15 (most common iPhone)              |
| 2        | 360px  | Most common Android                            |
| 3        | 1920px | Dominant desktop (22% market share)            |
| 4        | 768px  | iPad / tablet breakpoint                       |
| 5        | 1366px | Second most common desktop                     |
| 6        | 375px  | iPhone SE / older iPhones                      |
| 7        | 1024px | Laptop / large tablet                          |
| 8        | 320px  | Smallest phone (~3% traffic, good stress test) |
| 9        | 430px  | iPhone Pro Max                                 |
| 10       | 1440px | Large laptop                                   |

---

## The 10-Point Check (At Each Viewport)

1. **No horizontal scroll** — any at all is a failure
2. **Text overflow** — long words, URLs, usernames breaking containers
3. **Images and media** — not overflowing, `max-width: 100%` applied
4. **Touch targets** — 44px minimum on mobile viewports
5. **Navigation** — reachable and usable at this width
6. **Typography** — readable (16px min body), no clipping
7. **Flex/grid wrapping** — wrapping where expected, not where it shouldn't
8. **Positioned elements** — not overlapping or off-screen
9. **Z-index stacking** — modals, dropdowns, tooltips rendering correctly
10. **Sticky elements** — sticking as intended, not overlapping each other

---

## Edge Cases That Bite

| Edge case                            | Why it matters                                                          |
| ------------------------------------ | ----------------------------------------------------------------------- |
| **280px** (Galaxy Fold inner screen) | Overflow here usually signals a deeper problem                          |
| **768x1024 portrait**                | Tablets in portrait are often treated as desktop incorrectly            |
| **Browser zoom 200%**                | WCAG 2.1 AA requirement. Text must reflow; containers must not overflow |
| **RTL text**                         | If localizable, Arabic/Hebrew reverses all directional assumptions      |
| **Long unbreakable strings**         | Email addresses, URLs, API keys. Use `overflow-wrap: break-word`        |
| **Missing images**                   | Does layout collapse? Does alt text overflow?                           |
| **2560px+**                          | Content stretches; test max-width containers                            |
| **Landscape phone**                  | Different safe area insets; often forgotten                             |
| **iOS "Larger Text"**                | System accessibility setting. `px` values ignore it; `rem` respects it  |
| **Keyboard open on mobile**          | Fixed bottom elements get displaced                                     |

---

## The Three-Tier Testing Strategy

### Tier 1: During Development (Continuous)

Chrome DevTools drag-resize while building. After every meaningful CSS change:

- Drag from 320px to 1920px
- Check each breakpoint transition
- Check 50px above and below each breakpoint

### Tier 2: After a Feature (Automated)

Screenshot comparison at key viewports using Playwright or dev-browser:

```javascript
const viewports = [
  { width: 375, height: 812, name: "mobile" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 1440, height: 900, name: "desktop" },
];

for (const vp of viewports) {
  test(`layout at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/");
    await expect(page).toHaveScreenshot(`home-${vp.name}.png`);
  });
}
```

First run creates baselines. Subsequent runs fail with a diff image when layout changes unexpectedly.

### Tier 3: Before Shipping (Real Devices)

Spot check on actual devices:

1. **iPhone (iOS Safari)** — most different from Chrome in viewport handling
2. **Android phone (Chrome)** — 360-412px
3. **iPad portrait** — 768px, often missed

iOS Safari has the most quirks: viewport unit behavior, safe areas, scroll momentum.

---

## Testing Container Queries

Container queries don't respond to viewport — they respond to parent element width. To test in automation:

```javascript
test("card adapts in narrow container", async ({ page }) => {
  await page.goto("/components/card");
  await page.evaluate(() => {
    const container = document.querySelector(".card-wrapper");
    container.style.width = "300px";
  });
  const card = page.locator(".card");
  await expect(card).toHaveCSS("flex-direction", "column");
});
```

---

## Quick Screenshot Comparison (No Test Suite)

When you don't want to set up full Playwright tests:

1. Open DevTools > Device Mode
2. Set to Responsive, width = 375px
3. More Options > Capture Full Size Screenshot
4. Save as `page-375.png`
5. Repeat at 768px and 1440px
6. Compare visually or with an image diff tool

Low overhead, useful for one-off audits and before/after comparisons.

---

## What to Document in a Behavior Spec

Before coding responsive layouts, describe expected behavior per component:

```
Component: ProductCard
| Viewport   | Layout              | Image        | Text         |
|------------|---------------------|--------------|--------------|
| < 640px    | stack vertical      | full width   | 3 lines max  |
| 640-1023px | horizontal, img left| 40% width    | 2 lines max  |
| 1024px+    | grid card, 320px    | top, full-w  | 1 line       |
```

This table takes 5 minutes and catches "what should happen at X width?" before writing CSS. It's the code-first equivalent of seeing all breakpoints on a canvas.
