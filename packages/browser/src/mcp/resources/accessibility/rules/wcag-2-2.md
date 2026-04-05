# WCAG 2.2 New Criteria

Criteria added or changed in WCAG 2.2 compared to 2.1.

## Focus Not Obscured (2.4.11 — AA)

When an element receives keyboard focus, it must not be entirely hidden by sticky headers, footers, or overlapping panels.

```css
:target {
  scroll-margin-top: 80px;
}

:focus {
  scroll-margin-top: 80px;
  scroll-margin-bottom: 60px;
}
```

## Target Size Minimum (2.5.8 — AA)

Interactive targets must be at least **24 × 24 CSS pixels**. Recommended: 44×44px.

```css
button,
[role="button"],
input[type="checkbox"] + label,
input[type="radio"] + label {
  min-width: 24px;
  min-height: 24px;
}

/* Comfortable size */
.touch-target {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

Exceptions: inline text links, browser-controlled elements, targets where a 24px circle centered on the bounding box doesn't overlap another target.

## Dragging Movements (2.5.7 — AA)

Any drag action must have a single-pointer alternative (buttons, inputs).

```html
<!-- BAD — drag-only -->
<ul draggable="true">
  <li>Item 1</li>
</ul>

<!-- GOOD — drag + button alternatives -->
<ul>
  <li>
    <span>Item 1</span>
    <button aria-label="Move Item 1 up">↑</button>
    <button aria-label="Move Item 1 down">↓</button>
  </li>
</ul>
```

Applies to sliders, map panning, color pickers, and similar drag-based widgets.

## Consistent Help (3.2.6 — A)

If a help mechanism (contact info, chat widget, FAQ link) appears on multiple pages, it must be in the **same relative order** each time.

## Redundant Entry (3.3.7 — A)

Don't force users to re-enter information they already provided in the same session.

```html
<fieldset>
  <legend>Shipping address</legend>
  <label>
    <input type="checkbox" id="same-as-billing" checked />
    Same as billing address
  </label>
</fieldset>
```

## Accessible Authentication (3.3.8 — AA)

Login must not rely on cognitive function tests unless:

- Copy-paste or autofill is available
- An alternative method exists (passkey, SSO, email link)

```html
<!-- Allow paste in password fields -->
<input type="password" autocomplete="current-password" />

<!-- Offer alternatives -->
<button type="button">Sign in with passkey</button>
<button type="button">Email me a login link</button>
```

## Removed: Parsing (4.1.1)

The Parsing criterion was removed in 2.2 — modern browsers handle HTML errors robustly.
