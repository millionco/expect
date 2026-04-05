# Color & Sensory Patterns

The parent rule covers contrast ratios (4.5:1 / 3:1) and "never color alone." This sub-rule provides **fix patterns** for common contrast and sensory failures.

## Error Indication Without Color Alone

```html
<!-- BAD — only color indicates error -->
<input style="border-color: red;" />

<!-- GOOD — color + icon + text -->
<div class="field-error">
  <input aria-invalid="true" aria-describedby="email-error" />
  <span id="email-error" class="error-message">
    <svg aria-hidden="true"><!-- error icon --></svg>
    Please enter a valid email address
  </span>
</div>
```

## Focus States That Meet Contrast

```css
/* BAD — removes focus entirely */
*:focus {
  outline: none;
}

/* GOOD — keyboard-only visible focus with sufficient contrast */
:focus-visible {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}
```

The focus indicator itself must have at least 3:1 contrast against adjacent colors.

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Remove decorative animations entirely. Reduce (not remove) functional animations to simple opacity fades.

## Media Alternatives

```html
<!-- Video: captions required -->
<video controls>
  <source src="video.mp4" type="video/mp4" />
  <track kind="captions" src="captions.vtt" srclang="en" label="English" default />
</video>

<!-- Audio: provide transcript -->
<audio controls><source src="podcast.mp3" type="audio/mp3" /></audio>
<details>
  <summary>Transcript</summary>
  <p>Full transcript...</p>
</details>
```
