# Focus Management Patterns

The parent rule covers keyboard reachability, Tab/Escape behavior, focus trapping, and SPA focus. This sub-rule provides **implementation patterns**.

## Skip Link

```html
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <header><!-- navigation --></header>
  <main id="main-content" tabindex="-1"><!-- content --></main>
</body>
```

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: #fff;
  padding: 8px 16px;
  z-index: 100;
}
.skip-link:focus {
  top: 0;
}
```

## Focus Not Obscured (WCAG 2.2)

Focused elements must not be hidden behind sticky headers/footers:

```css
:focus {
  scroll-margin-top: 80px; /* height of sticky header */
  scroll-margin-bottom: 60px; /* height of sticky footer */
}
```

## Live Region Announcements

Announce dynamic content without moving focus:

```javascript
const announce = (message, type = "polite") => {
  const container = document.getElementById(`${type}-announcer`);
  container.textContent = "";
  requestAnimationFrame(() => {
    container.textContent = message;
  });
};
```

Clear the container before writing to ensure repeated identical messages trigger new announcements.

## SPA Route Change Focus

On client-side navigation:

1. Move focus to the main content heading or `<main>`
2. Update `document.title`
3. Announce the navigation via live region
