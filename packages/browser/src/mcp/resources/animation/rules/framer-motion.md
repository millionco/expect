---
name: framer-motion
description: Use Framer Motion (motion/react) correctly in React. Use when implementing layout animations, shared element transitions, gesture-driven interactions, or coordinated multi-element animation.
---

# Framer Motion

## when to apply

Reference these rules when:

- choosing between CSS and Framer Motion for an animation
- implementing layout animations (height, width, position changes)
- building shared element transitions across components
- using gesture props (whileHover, whileTap, whileDrag)
- coordinating multiple elements with variants and stagger

## rule categories by priority

| priority | category                   | impact   |
| -------- | -------------------------- | -------- |
| 1        | when to use Framer Motion  | critical |
| 2        | layout and layoutId        | critical |
| 3        | AnimatePresence            | high     |
| 4        | hooks                      | high     |
| 5        | variants and orchestration | medium   |
| 6        | gestures                   | medium   |

## quick reference

### 1. when to use Framer Motion (critical)

- interruptible animations (springs that redirect smoothly mid-flight)
- animating elements removed from DOM (exit animations)
- layout animations (height, position changes without knowing pixel values)
- shared layout transitions between components (tab highlights, card expansions)
- gesture-driven interactions (drag, pinch, throw)
- coordinating multiple elements with staggered timing
- for everything else (hover, active, infinite loops, spinners), CSS is simpler and lighter

### 2. layout and layoutId (critical)

- `layout` prop animates any CSS layout change by measuring before/after and interpolating with transforms
- can cause distortion with border-radius and child elements — use `layout="position"` to only animate position
- `layoutId` connects two separate elements across renders for shared layout animation — the library measures positions and creates the transition
- used for tab highlight indicators, card-to-modal expansions, button-to-popover morphs
- `layoutId` shared animations can drop frames during heavy page loads — fall back to CSS in those cases

### 3. AnimatePresence (high)

- every child must have a unique `key` prop — without it, exit animations won't trigger
- `mode="wait"` — old exits before new enters (wizard steps, content crossfades)
- `mode="popLayout"` — simultaneous exit/enter, old removed from flow immediately (can glitch with absolute positioning)
- `initial={false}` — prevents animation on first mount, only animates on subsequent state changes
- add blur during morphing transitions to mask intermediate states where both elements overlap

### 4. hooks (high)

- `useMotionValue` — mutable value that updates outside React render cycle, attach to `style` for 60fps
- `useTransform` — maps input ranges to output ranges: `useTransform(scrollY, [0, 500], [0, 1])` for scroll-to-opacity
- `useSpring` — wraps a motion value with spring physics for smooth transitions between value changes
- `useAnimate` — returns `[scope, animate]` for imperative control, supports `await` for sequencing
- common chain: `useMotionValue` (raw input) → `useTransform` (maps to animation values) → `useSpring` (smooths output)

### 5. variants and orchestration (medium)

- variants define named animation states for cleaner code than inline animate objects
- parent variants orchestrate children with `staggerChildren` (50-100ms) and `delayChildren`
- children automatically inherit variant names from parent — no need to pass animate prop
- use for lists, grids, or any parent-child animation coordination

### 6. gestures (medium)

- `whileHover`, `whileTap`, `whileDrag` for declarative gesture animations
- drag maintains momentum after release by default — use `dragMomentum={false}` to disable
- constrain drag with `dragConstraints` ref (another element's bounds) or pixel values
- Framer Motion's gesture handling is interruptible — hovering off mid-animation redirects smoothly

## common fixes

```jsx
// layout distortion with border-radius
// before — border-radius warps during layout animation
<motion.div layout className="rounded-lg" />
// after — only animate position, not size
<motion.div layout="position" className="rounded-lg" />

// shared transition dropping frames on page load
// before
<motion.div layoutId="card" />
// after — CSS fallback during heavy loads
<div className="card-css-transition" />

// imperative sequencing with useAnimate
const [scope, animate] = useAnimate();
await animate("[data-step='1']", { opacity: 1 }, { duration: 0.2 });
await animate("[data-step='2']", { y: 0 }, { type: "spring" });

// unnecessary spring on opacity
// before
<motion.div animate={{ opacity: 1 }} transition={{ type: "spring" }} />
// after — tween is correct for opacity
<motion.div animate={{ opacity: 1 }} transition={{ duration: 0.15 }} />
```

## review guidance

- if the animation could be done with CSS (hover, active, simple fade), don't use Framer Motion
- if `layout` causes visual distortion, try `layout="position"` first
- if `layoutId` transitions stutter during navigation, fall back to CSS
- if AnimatePresence exit doesn't fire, verify unique `key` on every child
- if animation triggers React re-renders, verify motion values are used via `style` prop, not state
