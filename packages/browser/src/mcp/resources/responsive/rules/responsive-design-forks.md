# Responsive Design Forks

Patterns where there is no single correct responsive translation. When the skill identifies one of these, it should present the options with tradeoffs and ask the user to choose — not default silently.

---

## How to Use This Reference

When auditing existing code or planning new responsive layouts, scan for the patterns below. Each fork includes:

- **The desktop pattern** — what exists or is planned
- **Mobile options** — 2-3 approaches with tradeoffs
- **The question to ask** — what the user needs to decide
- **Signals** — what in the codebase hints at which option is best

---

## Fork 1: Sidebar with Mixed Content

**Desktop pattern:** Sidebar with navigation + filters + summary/stats + secondary actions.

### Option A: Bottom Sheet Drawer

- Content stays grouped in a single drawer
- Triggered by a hamburger/menu button
- Good when sidebar content is secondary and rarely accessed
- **Tradeoff:** Hidden by default — users may not discover it

### Option B: Tab Bar with Sections

- Each sidebar section becomes a tab or bottom nav item
- Content is accessible simultaneously without opening a drawer
- Good when sidebar sections are equally important
- **Tradeoff:** Takes permanent screen space; limited to 3-5 sections

### Option C: Collapsible Accordion Inline

- Sidebar content collapses into an accordion above or below main content
- Everything is visible in the page flow
- Good when sidebar content is a reference that users scan
- **Tradeoff:** Lengthens the page; may push main content too far down

### The Question

> "This sidebar has [N] distinct content types: [list them]. On mobile, do you want them (a) hidden in a drawer and opened on demand, (b) accessible as permanent tabs, or (c) collapsed inline above the main content?"

### Signals

- If sidebar has 5+ sections → drawer is likely best (too many for tabs)
- If sidebar has navigation → tabs or bottom nav
- If sidebar has filters → floating action button that opens a filter sheet
- If sidebar has stats/summary → inline above main content

---

## Fork 2: Data Table with Many Columns

**Desktop pattern:** Table with 6+ columns of data.

### Option A: Horizontal Scroll + Sticky First Column

- All data accessible by scrolling
- First column stays visible for context
- Good for data-heavy tables where all columns matter equally
- **Tradeoff:** Users may not realize they can scroll; discoverability is poor

### Option B: Card Stack

- Each row becomes a card with label:value pairs
- Good for 4-8 columns where row-level reading matters more than column comparison
- **Tradeoff:** Cannot compare across rows; loses the tabular advantage

### Option C: Priority Columns + Expand/Details

- Show only 2-3 essential columns; rest available via "expand" or details view
- Good when some columns are clearly more important than others
- **Tradeoff:** Requires deciding which columns are "essential" — may vary by user

### The Question

> "This table has [N] columns. Which columns are essential on mobile? That determines whether we (a) scroll horizontally with a sticky first column, (b) stack each row as a card, or (c) show priority columns with an expand option."

### Signals

- If users compare across rows → horizontal scroll (A)
- If users read one row at a time → card stack (B)
- If there are clearly primary/secondary columns → priority + expand (C)
- If table has actions (edit/delete) per row → card stack handles this most cleanly

### Implementation: Card Stack on Mobile

Mobile-first: the card layout is the base, table layout is added at wider viewports.

```css
/* Mobile base: card layout */
table,
thead,
tbody,
tr,
th,
td {
  display: block;
}
thead tr {
  display: none;
}
tr {
  margin-bottom: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
}
td {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
}
td::before {
  content: attr(data-label);
  font-weight: 600;
}

/* Desktop: restore table layout */
@media (min-width: 641px) {
  table {
    display: table;
  }
  thead {
    display: table-header-group;
  }
  tbody {
    display: table-row-group;
  }
  tr {
    display: table-row;
    margin: 0;
    border: none;
    padding: 0;
  }
  th,
  td {
    display: table-cell;
  }
  td::before {
    display: none;
  }
}
```

Requires `data-label` attributes on each `<td>` in the HTML — Claude must add these when implementing. Note: changing `display` on table elements may break screen reader semantics — test with AT.

### Implementation: Column Hiding

```css
@media (min-width: 769px) {
  .col-secondary {
    display: table-cell;
  }
}
```

Only hide genuinely secondary data — hidden columns are invisible to assistive technology.

For sticky table header patterns (dual-axis sticky), see `references/sticky-scroll-patterns.md`.

---

## Fork 3: Multi-Panel Dashboard

**Desktop pattern:** Header + sidebar nav + main content area + optional detail panel. Multiple information-dense regions visible simultaneously.

### Option A: Tab-Based Single View

- Each panel becomes a tab or screen
- Cleanest mobile experience; one thing at a time
- Good for dashboards where users work in one section at a time
- **Tradeoff:** Loses the at-a-glance overview that makes dashboards valuable

### Option B: Stacked with Anchored Navigation

- Panels stack vertically; sticky anchor nav at top for jumping between sections
- Everything is in the page flow, accessible by scrolling
- Good when all panels need to be scannable in sequence
- **Tradeoff:** Very long page; context switching requires scrolling

### Option C: Collapsible Regions + Scroll

- Each panel collapses to a summary/header with expand capability
- Shows overview of all panels; user expands what they need
- Good when the summary is useful without the detail
- **Tradeoff:** Requires designing meaningful collapsed states

### The Question

> "This dashboard has [N] panels visible simultaneously on desktop. How much information density matters on mobile? (a) One panel at a time (tabs), (b) all panels stacked and scannable, or (c) collapsed summaries that expand on demand?"

### Signals

- If dashboard is monitoring/status → collapsed summaries (C) — users scan for anomalies
- If dashboard is workflow → tabs (A) — users focus on one task
- If panels have sequential relationships → stacked (B)

---

## Fork 4: Hero with Complex Visual Content

**Desktop pattern:** Large hero with background video/image, overlay text, CTA, secondary elements (stats, testimonials, animated graphics).

### Option A: Simplified Adaptation

- Keep the same structure but simplify: static image replaces video, stacked layout, smaller text
- Good when the hero's message works at any size
- **Tradeoff:** May feel like a "shrunk desktop" — not designed for mobile

### Option B: Different Mobile Hero

- Completely different mobile hero designed for the mobile context
- Smaller, faster, thumb-friendly
- Good when the desktop hero relies on visual impact that doesn't scale down
- **Tradeoff:** Two things to maintain; content can drift out of sync

### Option C: Progressive Disclosure

- Mobile shows headline + CTA only; stats/testimonials/video are below the fold or behind a "learn more" interaction
- Good when the CTA is the primary goal and surrounding content is supporting
- **Tradeoff:** Supporting content may never be seen

### The Question

> "The desktop hero relies on [visual element] for impact that won't translate to 375px. Do you want to (a) adapt it (simpler version, same structure), (b) design a different mobile hero, or (c) reduce to headline + CTA with the rest below the fold?"

### Signals

- If hero has background video → Option A with static image fallback, or C
- If hero has complex animations/graphics → Option B (they'll be janky on mobile)
- If the CTA is the whole point → Option C (strip everything else)

---

## Fork 5: Multiple Sticky Elements

**Desktop pattern:** Sticky header (60px) + sticky subnav (40px) + sticky filters (48px). Total: ~148px of stuck content.

### Option A: Keep All (Cascading Sticky)

- All three remain sticky with stacked `top` offsets
- Good on large tablets and desktops
- **Tradeoff:** 148px is ~20% of a mobile screen. Content area becomes too small.

### Option B: Collapse Subnav into Header

- Header absorbs subnav functionality (tabs, dropdown)
- Reduces sticky stack to ~70px
- Good when subnav items are few (3-5)
- **Tradeoff:** Header becomes more complex and may need its own responsive states

### Option C: Filters Become Floating Button + Sheet

- Header stays sticky, subnav optionally sticky, filters open from a floating action button
- Reduces permanent sticky space to 60-100px
- Good when filters are used intermittently, not constantly
- **Tradeoff:** Filters are no longer visible; users may forget active filter state

### The Question

> "[N] sticky elements stack to ~[X]px on mobile — that's [Y]% of the screen. Which ones truly need to stay visible while scrolling?"

### Signals

- If subnav has 3-5 items → collapse into header (B)
- If filters are applied rarely → floating button + sheet (C)
- If user constantly references all three → keep cascading but reduce heights (A with smaller mobile variants)

---

## Fork 6: Complex Navigation

**Desktop pattern:** Mega menu, multi-level dropdowns, or navigation with 15+ items across 3+ categories.

### Option A: Hamburger with Accordion Categories

- Single hamburger → full-screen overlay → category accordions
- The standard approach for deep navigation
- **Tradeoff:** Adds taps to reach any destination; deep nesting is confusing

### Option B: Bottom Tab Bar + Category Pages

- Primary sections as bottom tabs; sub-navigation within each tab's page
- Good for app-like experiences with 3-5 top-level sections
- **Tradeoff:** Only works for 3-5 sections; more requires overflow handling

### Option C: Search-First Navigation

- De-emphasize browse navigation; prominently feature search
- Good when users know what they're looking for
- **Tradeoff:** New users who don't know the content can't browse effectively

### The Question

> "This navigation has [N] items across [M] categories. On mobile, is the primary user behavior browsing/exploring or searching for something specific?"

### Signals

- If content-heavy site with defined categories (e-commerce, docs) → hamburger + accordion (A)
- If app with 3-5 core flows (dashboard, messages, settings, profile) → bottom tabs (B)
- If content is highly searchable and users have intent (knowledge base, marketplace) → search-first (C)
- If navigation has 3+ nesting levels → hamburger (A) — bottom tabs can't handle depth
- If navigation items have icons → bottom tabs (B) — icon + label fits the tab bar pattern

---

## Fork 7: Form Layout with Complex Fields

**Desktop pattern:** Multi-column form, inline validation, conditional fields, field groups side by side.

### Option A: Single Column Stack

- Every field goes full-width, stacked vertically
- Simplest and most reliable on mobile
- **Tradeoff:** Long forms become very long; user may lose context of where they are

### Option B: Stepped/Wizard

- Break form into steps; one group of fields per screen
- Good for forms with 10+ fields or natural groupings
- **Tradeoff:** Users can't scan the whole form; progress indicator needed

### Option C: Accordion Sections

- Logical field groups collapse into sections; user expands one at a time
- Good for reference/settings forms where users edit specific sections
- **Tradeoff:** Users may miss required fields in collapsed sections

### The Question

> "This form has [N] fields in [M] groups. Is this a fill-once form (registration, checkout) or an edit-many-times form (settings, profile)?"

### Signals

- Fill-once → stepped wizard (B) for 10+ fields, single column (A) for fewer
- Edit-many-times → accordion (C)
- Mix of required/optional fields → step through required, accordion for optional

---

## Fork 8: Content Grid with Varying Card Types

**Desktop pattern:** Bento grid or masonry layout with hero cards, standard cards, and wide cards.

### Option A: Linear Stack (All Same Width)

- Every card becomes full-width, stacked vertically
- Hero card can be taller or have a different layout to maintain hierarchy
- **Tradeoff:** Loses the visual rhythm and hierarchy of the bento grid

### Option B: Horizontal Scroll Sections

- Group cards by type; each group scrolls horizontally
- Preserves some visual variety
- **Tradeoff:** Less discoverable; users may miss cards off-screen

### Option C: Two-Column Mini Grid

- Standard cards go 2-up; hero card spans full width
- Preserves some grid feel on mobile
- **Tradeoff:** Cards may be too narrow on phones under 375px

### The Question

> "The desktop grid uses varying card sizes for visual hierarchy. On mobile, do you want to (a) stack everything full-width (simplest), (b) group into horizontal scroll sections (preserves variety), or (c) keep a 2-column mini-grid (preserves density)?"

### Signals

- If hierarchy matters (featured vs. regular) → Option C with hero card full-width
- If all cards are equal → Option A
- If cards are grouped by category → Option B
