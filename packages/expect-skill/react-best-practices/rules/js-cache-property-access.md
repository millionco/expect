---
title: Cache Property Access in Loops
impact: LOW-MEDIUM
impactDescription: reduces lookups
tags: javascript, loops, optimization, caching
---

## Cache Property Access in Loops

Cache object property lookups in hot paths.

**Incorrect (3 lookups × N iterations):**

```typescript
for (let i = 0; i < arr.length; i++) {
  process(obj.config.settings.value);
}
```

**Correct (1 lookup total):**

```typescript
const value = obj.config.settings.value;
const len = arr.length;
for (let i = 0; i < len; i++) {
  process(value);
}
```

> **Note:** This assumes `arr.length` and `obj.config.settings.value` do not change during the loop. If the loop body mutates the array or the accessed property, cache the values inside the loop or use the original uncached form.
