---
name: container-animation
description: Animate container width/height with useMeasure + Motion. Use when building expandable sections, animated buttons, accordions, or any container that resizes to fit dynamic content.
---

# Container Animation

CSS width and height are not animatable — the browser can't interpolate between a fixed value and "whatever the content needs." The two-div pattern solves this.

## when to apply

Reference these rules when:

- animating a container's width or height in response to content changes
- building expandable sections, accordions, FAQs, detail panels
- creating buttons that resize for loading states or label changes

## the pattern

Outer div: animated by Motion. Inner div: measured by ResizeObserver.

```tsx
function useMeasure() {
  const [element, setElement] = useState(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const ref = useCallback((node) => setElement(node), []);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setBounds({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [ref, bounds];
}

function AnimatedContainer({ children }) {
  const [ref, bounds] = useMeasure();
  return (
    <motion.div animate={{ height: bounds.height > 0 ? bounds.height : "auto" }}>
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}
```

## rules

- **two-div pattern** — outer animated div, inner measured div. Never measure and animate the same element (creates an infinite loop)
- **guard initial zero** — check `bounds > 0` before animating. Fall back to `"auto"` to avoid animation from 0 on mount
- **use ResizeObserver** — not `getBoundingClientRect` (causes layout thrashing)
- **overflow hidden** — set `overflow: hidden` on the animated container during transitions
- **callback ref** — use callback ref (`useCallback`), not `useRef`, for the measurement hook
- **small transition delay** — add a slight delay for a natural "catching up" feel
- **use sparingly** — buttons, accordions, interactive elements. Not every container needs this

## review guidance

- if the same element has both the measurement ref and the `animate` prop, flag the loop
- if `bounds` is used without a zero guard, flag animation-from-nothing on mount
- if `getBoundingClientRect` is used for ongoing measurement, flag layout thrashing risk
- if the pattern is applied to static containers that don't change size, flag unnecessary complexity
