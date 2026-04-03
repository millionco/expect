---
name: exit-animations
description: AnimatePresence patterns for exit animations. Use when implementing enter/exit transitions, coordinating nested exits, or choosing AnimatePresence modes.
---

# Exit Animations

When an element leaves the DOM, it's gone — no way to animate something that doesn't exist. AnimatePresence keeps departing elements mounted long enough to animate out.

## when to apply

Reference these rules when:

- conditionally rendering elements that need exit animations
- coordinating parent-child exit sequences
- choosing between AnimatePresence modes (sync, wait, popLayout)
- using `useIsPresent` or `usePresence` hooks

## quick reference

### wrapper requirements

- conditional motion elements need an AnimatePresence wrapper
- elements inside AnimatePresence need an `exit` prop
- dynamic lists need unique `key` values, not array index
- `exit` should mirror `initial` for visual symmetry

### presence hooks

- `useIsPresent` returns boolean — true while mounted, false during exit
- `useIsPresent` must be called from a **child** component, not the parent with the conditional
- disable interactions on exiting elements (buttons, inputs)
- `usePresence` returns `[isPresent, safeToRemove]` — call `safeToRemove` after async cleanup

### modes

| Mode        | Behavior                                      | Use when                                                    |
| ----------- | --------------------------------------------- | ----------------------------------------------------------- |
| `sync`      | Enter and exit animate simultaneously         | Crossfades. Handle layout conflicts — both elements visible |
| `wait`      | Exit completes before enter starts            | Elegant transitions. Doubles duration — halve your timing   |
| `popLayout` | Exiting element removed from flow immediately | List reordering, morphing layouts, container measurements   |

### nested exits

- nested AnimatePresence needs `propagate` prop for parent-child exit coordination
- without `propagate`, children vanish instantly when parent exits
- coordinate parent-child exit durations for smooth sequences

## common fixes

```tsx
/* wrong: useIsPresent in parent */
function Parent() {
  const isPresent = useIsPresent(); // won't work here
  return show && <motion.div exit={{ opacity: 0 }} />;
}

/* right: useIsPresent in child */
function Parent() {
  return <AnimatePresence>{show && <Card />}</AnimatePresence>;
}
function Card() {
  const isPresent = useIsPresent();
  return (
    <motion.div exit={{ opacity: 0 }} style={{ pointerEvents: isPresent ? "auto" : "none" }} />
  );
}

/* popLayout for list reordering */
<AnimatePresence mode="popLayout">
  {items.map((item) => (
    <motion.div key={item.id} exit={{ opacity: 0 }} layout />
  ))}
</AnimatePresence>;
```

## review guidance

- if exit mirrors a different axis than initial, flag asymmetry
- if `useIsPresent` is called in the parent component, move to child
- if `wait` mode is used without halved timing, flag doubled duration
- if nested AnimatePresence lacks `propagate`, children won't animate on parent exit
- if exiting elements remain interactive (clickable buttons), disable with `pointerEvents: "none"`
