---
name: laws-of-ux
description: Cognitive psychology principles for interface design. Use when sizing interactive targets, reducing decision complexity, chunking data, optimizing response time, or handling user input.
---

# Laws of UX

Psychological principles behind interfaces that feel right. These aren't about interfaces — they're about how people work.

## when to apply

Reference these rules when:

- sizing buttons, links, or interactive targets
- designing menus, option lists, or navigation
- displaying data tables, dashboards, or long content
- optimizing perceived performance
- handling form input and validation

## rules by priority

| priority | law | impact |
| --- | --- | --- |
| 1 | Fitts's Law | critical |
| 2 | Doherty Threshold | critical |
| 3 | Hick's Law | high |
| 4 | Miller's Law | high |
| 5 | Postel's Law | medium |

### 1. Fitts's Law (critical)

- interactive targets minimum 32px
- expand hit areas with invisible padding or `::before` pseudo-elements
- the bigger and closer a target, the easier to click — every pixel of padding is a usability decision
- related: "coyote time" in games — temporal forgiveness is the same principle applied to time

```css
.icon-button { position: relative; }
.icon-button::before {
  content: "";
  position: absolute;
  inset: -8px;
}
```

### 2. Doherty Threshold (critical)

- respond within 400ms to feel instant
- under 100ms feels like an extension of the user's hand
- above 2000ms feels broken
- if you can't make it fast, make it feel fast: optimistic UI, skeleton screens, progress indicators
- the best interactions are ones where you never think about speed

### 3. Hick's Law (high)

- minimize choices to reduce decision time — going from 2→4 options is noticeable, 8→16 is painful
- progressive disclosure: show what matters now, reveal complexity when needed
- the best menus curate, not list

### 4. Miller's Law (high)

- chunk data into groups of 5–9 for scannability
- raw data vs. chunked data is processed completely differently by the brain
- phone numbers, credit cards, long IDs — always chunk

### 5. Postel's Law (medium)

- accept messy human input, output clean data
- "jan 15 2024" and "2024-01-15" mean the same thing — accept both
- the more formats you accept, the less friction users experience
- validate generously, format strictly

## additional principles

- **Jakob's Law** — use familiar UI patterns users know from other sites
- **Aesthetic-Usability** — visual polish increases perceived usability
- **Von Restorff** — make important elements visually distinct
- **Serial Position** — place key items first or last in sequences
- **Peak-End Rule** — end experiences with clear success states
- **Tesler's Law** — move complexity to the system, not the user
- **Goal Gradient** — show progress toward completion
- **Pragnanz** — simplify complex visuals into clear forms

## review guidance

- if interactive targets are under 32px, expand with padding or pseudo-elements
- if response time exceeds 400ms without a loading indicator, flag perceived slowness
- if a menu presents more than 7 options without grouping, flag cognitive overload
- if data is displayed without chunking (long numbers, dense tables), flag readability
- if inputs reject valid formats (e.g. "jan 15" for a date field), flag Postel's Law violation
