# @browser-tester/browser — Package Learnings

What the code does, how it connects, and what it consists of. Written for migration planning.

---

## What This Package Is

A Playwright-based browser testing layer that provides accessibility tree snapshots with stable element refs, ref-based actions, cookie injection, video recording, annotated screenshots, and snapshot diffing. It wraps Playwright's low-level APIs into a higher-level workflow: launch a browser → take a snapshot → interact via refs → observe changes.

The package re-exports the full `@browser-tester/cookies` API so consumers only need one import.

---

## Directory Structure

```
src/
├── index.ts                         ← Public API (re-exports everything)
├── types.ts                         ← All interfaces (SnapshotResult, RefEntry, CreatePageOptions, etc.)
├── constants.ts                     ← Timeouts, role sets, video dimensions, chromium args
├── snapshot.ts                      ← Core: accessibility tree → refs → locator factory
├── act.ts                           ← Runs an action on a ref, returns new snapshot
├── create-page.ts                   ← Launches Chromium, optional cookies/video, navigates
├── inject-cookies.ts                ← Injects Cookie[] into a Playwright BrowserContext
├── annotated-screenshot.ts          ← Screenshot with numbered badges over each ref's bounding box
├── diff.ts                          ← Myers diff algorithm for before/after snapshot trees
├── save-video.ts                    ← Saves page recording to disk
│
└── utils/
    ├── compact-tree.ts              ← Prunes tree lines with no refs or ref-bearing descendants
    ├── create-locator.ts            ← Factory: (ref: string) → Locator, throws on unknown ref
    ├── find-cursor-interactive.ts   ← Finds elements with cursor:pointer/onclick/tabindex not in ARIA roles
    ├── friendly-error.ts            ← Maps Playwright errors to clearer messages
    ├── get-indent-level.ts          ← Returns indent level (2-space units) for a line
    ├── parse-aria-line.ts           ← Parses "- role \"name\"" from aria snapshot lines
    ├── resolve-locator.ts           ← RefEntry → Playwright Locator (by selector or role+name+nth)
    ├── resolve-nth-duplicates.ts    ← Assigns nth index to duplicate role+name entries
    ├── snapshot-stats.ts            ← Computes lines, chars, estimated tokens, ref counts
    └── wait-for-settle.ts           ← Waits for navigation + DOM settle after URL change
```

---

## Public API

Exported from `index.ts`:

| Export                                     | What it does                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPage(url, options)`                 | Launches Chromium, optionally injects cookies from default browser, optionally records video, navigates to URL. Returns `{ browser, context, page }`. |
| `snapshot(page, options)`                  | Takes an accessibility tree snapshot, assigns refs to interactive/content elements, returns `{ tree, refs, stats, locator }`.                         |
| `act(page, ref, action, options)`          | Takes snapshot → runs action on ref's locator → takes new snapshot. Returns the after-snapshot.                                                       |
| `injectCookies(context, cookies)`          | Converts cookies to Playwright format and adds them to a BrowserContext.                                                                              |
| `annotatedScreenshot(page, options)`       | Takes a snapshot, overlays numbered badges at each ref's bounding box, captures screenshot, removes overlay.                                          |
| `diffSnapshots(before, after)`             | Myers diff on two snapshot tree strings. Returns `{ diff, additions, removals, unchanged, changed }`.                                                 |
| `saveVideo(page, outputPath)`              | Closes the page, saves its recorded video to disk. Returns path or null.                                                                              |
| `waitForNavigationSettle(page, urlBefore)` | Short delay, then if URL changed, waits for `domcontentloaded` + settle delay.                                                                        |

Plus all `@browser-tester/cookies` exports are re-exported (extractCookies, detectBrowserProfiles, matchCookies, toPlaywrightCookies, etc.).

---

## Core Data Flow

### The Snapshot Pipeline (`snapshot.ts`)

This is the centerpiece of the package. It converts a Playwright page into a structured, ref-indexed accessibility tree.

```
snapshot(page, options)
  │
  ├── Resolve root: options.selector ? page.locator(selector) : page.locator("body")
  ├── root.ariaSnapshot({ timeout })           ← Playwright's built-in ARIA tree dump
  │
  ├── For each line in raw tree:
  │     ├── Skip if isTooDeep(line, maxDepth)   ← indent level exceeds maxDepth
  │     ├── parseAriaLine(line)                 ← regex: /- (\w+)\s*(?:"((?:[^"\\]|\\.)*)")?/
  │     │     └── Returns { role, name } or null (skips "text" role)
  │     ├── If interactive-only mode: skip non-INTERACTIVE_ROLES
  │     ├── shouldAssignRef(role, name, interactive):
  │     │     ├── INTERACTIVE_ROLES → always true
  │     │     ├── interactive mode → false (only interactive gets refs)
  │     │     └── CONTENT_ROLES with non-empty name → true
  │     └── If assigning ref:
  │           refs[`e${++count}`] = { role, name }
  │           line += ` [ref=e${count}]`
  │
  ├── If options.cursor:
  │     appendCursorInteractiveElements(page, ...)
  │     ├── findCursorInteractive(page, selector)  ← page.evaluate()
  │     │     └── Finds elements with cursor:pointer, onclick, tabindex
  │     │         that are NOT in INTERACTIVE_ROLES or standard HTML tags
  │     │         Builds unique CSS selectors for each
  │     ├── Dedupes by name (case-insensitive) against existing refs
  │     └── Adds "# Cursor-interactive elements:" header + clickable refs
  │
  ├── resolveNthDuplicates(refs)                ← Groups by role|name, assigns nth to duplicates
  │
  ├── If interactive && no refs: tree = "(no interactive elements)"
  ├── If compact: tree = compactTree(tree)      ← removes lines without refs or ref descendants
  │
  ├── computeSnapshotStats(tree, refs)          ← lines, chars, tokens, totalRefs, interactiveRefs
  │
  └── Return { tree, refs, stats, locator: createLocator(page, refs) }
```

### The Ref System

Refs are the key abstraction. Each interactive or content element gets a stable identifier like `e1`, `e2`, etc.

**RefEntry** shape:

```
{ role: AriaRole, name: string, nth?: number, selector?: string }
```

- `role` + `name` come from Playwright's ARIA tree
- `nth` is set only when multiple elements share the same role+name (disambiguation)
- `selector` is set only for cursor-interactive elements (CSS selector instead of ARIA)

**Ref resolution** (`resolveLocator`):

1. If `entry.selector` exists → `page.locator(selector)` (for cursor-interactive)
2. Otherwise → `page.getByRole(role, { name, exact: true })`, plus `.nth(n)` if nth is set

### The Act Loop (`act.ts`)

```
act(page, ref, action, options)
  │
  ├── snapshot(page, options)        ← "before" snapshot to get locator
  ├── action(before.locator(ref))    ← run the user's action (click, fill, etc.)
  │     └── On error: toFriendlyError(error, ref)
  └── snapshot(page, options)        ← "after" snapshot with fresh refs
```

This means every `act` call takes **two snapshots** — one to resolve the ref, one to see the result.

### Page Creation (`create-page.ts`)

```
createPage(url, options)
  │
  ├── chromium.launch({ headless, executablePath, args: HEADLESS_CHROMIUM_ARGS })
  │
  ├── If cookies === true:
  │     resolveDefaultBrowserContext():
  │     ├── detectDefaultBrowser()                 ← OS default browser
  │     └── detectBrowserProfiles({ browser })[0]  ← first profile
  │
  ├── resolveVideoOptions(video):
  │     ├── true → { dir: tmpdir(), size: 1280×720 }
  │     └── VideoOptions → fill in default size if missing
  │
  ├── browser.newContext({ recordVideo?, locale? })
  │
  ├── If cookies:
  │     ├── Array.isArray(cookies) → use directly
  │     └── cookies === true:
  │           extractDefaultBrowserCookies(url, context):
  │           ├── Try extractProfileCookies(preferredProfile) first
  │           └── Fallback to extractCookies({ url, browsers: [defaultBrowser] })
  │     └── injectCookies(context, cookies)
  │
  ├── context.newPage()
  ├── page.goto(url, { waitUntil })
  │
  └── Return { browser, context, page }
      └── On error: browser.close() + rethrow
```

---

## Key Types

```typescript
interface SnapshotOptions {
  timeout?: number; // ARIA snapshot timeout (default 30s)
  interactive?: boolean; // Only include INTERACTIVE_ROLES
  compact?: boolean; // Remove tree lines without refs
  maxDepth?: number; // Max indent depth to include
  selector?: string; // Root CSS selector (default "body")
  cursor?: boolean; // Include cursor-interactive elements
}

interface RefEntry {
  role: AriaRole; // Playwright's aria role
  name: string; // Element's accessible name
  nth?: number; // Disambiguation index for duplicates
  selector?: string; // CSS selector (cursor-interactive only)
}

interface RefMap {
  [ref: string]: RefEntry;
}

interface SnapshotResult {
  tree: string; // The full tree text with [ref=eN] markers
  refs: RefMap; // All assigned refs
  stats: SnapshotStats; // lines, characters, estimatedTokens, totalRefs, interactiveRefs
  locator: (ref: string) => Locator; // Ref → Playwright Locator
}

interface CreatePageOptions {
  headed?: boolean; // Show browser window
  executablePath?: string;
  cookies?: boolean | Cookie[]; // true = auto-detect from default browser
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  video?: boolean | VideoOptions;
}

interface CreatePageResult {
  browser: PlaywrightBrowser;
  context: BrowserContext;
  page: Page;
}
```

---

## Subsystem Details

### Accessibility Tree Parsing (`parse-aria-line.ts`)

Regex: `/- (\w+)\s*(?:"((?:[^"\\]|\\.)*)")?/`

Parses Playwright's aria snapshot format:

- `- button "Submit"` → `{ role: "button", name: "Submit" }`
- `- heading "Hello \"World\""` → `{ role: "heading", name: 'Hello "World"' }` (handles escapes)
- `- text "..."` → `null` (excluded)
- Lines without the pattern → `null`

### Role Classification (`constants.ts`)

Two sets determine ref assignment:

**INTERACTIVE_ROLES** (always get refs): button, link, textbox, checkbox, radio, combobox, listbox, menuitem, menuitemcheckbox, menuitemradio, option, searchbox, slider, spinbutton, switch, tab, treeitem

**CONTENT_ROLES** (get refs only in non-interactive mode with non-empty name): heading, cell, gridcell, columnheader, rowheader, listitem, article, region, main, navigation

### Cursor-Interactive Discovery (`find-cursor-interactive.ts`)

Runs `page.evaluate()` to find elements that look interactive but aren't in the ARIA tree:

1. Skip standard interactive HTML tags (a, button, input, select, textarea, details, summary)
2. Skip elements with ARIA interactive roles
3. Check for: `cursor:pointer`, `onclick` attribute, `tabindex` (not -1)
4. Skip if cursor:pointer is inherited from parent (not the originator)
5. Skip if no text or zero-size
6. Build unique CSS selector: data-testid > id > tag.class path (up to 10 segments)
7. These get the synthetic role `"clickable"` (cast to `AriaRole`)

### Compact Tree (`compact-tree.ts`)

Filters tree lines to keep only:

1. Lines containing `[ref=` markers
2. Lines with content (contain `:` but don't end with `:` — i.e., structural nodes with values)
3. Lines whose descendants contain refs (lookahead by indent level)

### Snapshot Diffing (`diff.ts`)

Full Myers diff implementation (not a library dependency):

- Builds an edit graph with `Int32Array` vectors for performance
- Traces the shortest edit path through the diagonal graph
- Produces `DiffEdit[]` with types: equal, insert, delete
- Output format: `"  "` prefix for unchanged, `"+ "` for additions, `"- "` for removals
- Returns `{ diff, additions, removals, unchanged, changed }`

### Annotated Screenshots (`annotated-screenshot.ts`)

1. Takes a snapshot to get refs
2. For each ref, resolves the locator and gets `boundingBox()`
3. Injects a DOM overlay (z-index max, pointer-events none) with red badges showing `[N]` at each element's position
4. Takes screenshot
5. Removes overlay in `finally`
6. Returns `{ screenshot: Buffer, annotations: Annotation[] }`

### Friendly Errors (`friendly-error.ts`)

Maps five Playwright error patterns to clearer messages:

| Pattern                       | Friendly message                                                                |
| ----------------------------- | ------------------------------------------------------------------------------- |
| "strict mode violation"       | `Ref "eN" matched N elements. Run snapshot to get updated refs.`                |
| "intercepts pointer events"   | `Ref "eN" is blocked by an overlay. Dismiss any modals or banners first.`       |
| "not visible" (not timeout)   | `Ref "eN" is not visible. Try scrolling it into view.`                          |
| "Timeout...exceeded"          | `Action on "eN" timed out. The element may be blocked or still loading.`        |
| "waiting for...to be visible" | `Ref "eN" not found or not visible. Run snapshot to see current page elements.` |

### Navigation Settle (`wait-for-settle.ts`)

After an action that might trigger navigation:

1. Wait 100ms (NAVIGATION_DETECT_DELAY_MS)
2. If URL changed: wait for `domcontentloaded` load state (with catch), then wait 500ms (POST_NAVIGATION_SETTLE_MS)

---

## Dependencies

| Dependency                | Usage                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `playwright`              | Browser automation — launch, context, page, locators, ARIA snapshots, screenshots, video                       |
| `@browser-tester/cookies` | Cookie extraction from local browsers, format conversion                                                       |
| `zod`                     | Listed as dependency but **not imported anywhere in source** — possibly unused or used at runtime by consumers |
| `node:os`                 | `tmpdir()` for default video recording directory                                                               |

---

## Constants

```typescript
SNAPSHOT_TIMEOUT_MS = 30_000; // Default ARIA snapshot timeout
REF_PREFIX = "e"; // Ref naming: e1, e2, e3...
EXCLUDED_ARIA_ROLE = "text"; // Always excluded from parsing
DEFAULT_VIDEO_WIDTH_PX = 1280; // Default recording size
DEFAULT_VIDEO_HEIGHT_PX = 720;
HEADLESS_CHROMIUM_ARGS = [
  // WebGL/GPU flags for headless
  "--enable-webgl",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--ignore-gpu-blocklist",
];
NAVIGATION_DETECT_DELAY_MS = 100; // Wait before checking URL change
POST_NAVIGATION_SETTLE_MS = 500; // Wait after navigation detected
ESTIMATED_CHARS_PER_TOKEN = 4; // For token count estimation
MAX_ELEMENT_TEXT_LENGTH = 100; // Truncation limit for cursor-interactive text
```

---

## Error Handling Strategy

No try-catch in `snapshot` itself — errors from Playwright propagate directly.

`act` wraps the user action in try-catch and transforms errors via `toFriendlyError`.

`createPage` catches errors during setup and ensures `browser.close()` runs before rethrowing.

`annotatedScreenshot` uses `finally` to remove the injected overlay even if screenshot fails.

`saveVideo` has no error handling — caller is responsible.

---

## Cross-Cutting Concerns

### Two Snapshot Cost in Act

Every `act()` call takes **two** snapshots — one before (to resolve the ref to a locator) and one after (to return the result). This is inherent to the ref model: refs are snapshot-scoped, so you need a snapshot to resolve them.

### The "clickable" Hack

Cursor-interactive elements get `role: "clickable" as AriaRole` — this is a synthetic role not in Playwright's type system. It requires a type cast and means `resolveLocator` must check `entry.selector` first (these elements can't be found by role).

### Ref Stability

Refs are position-based (sequential counter), not content-based. If the DOM changes, the same element may get a different ref. The pattern is: take snapshot → use refs immediately → take new snapshot if needed.

### No Deduplication of Cursor-Interactive by Selector

Cursor-interactive elements are deduped by `name` (case-insensitive) against existing ARIA refs, but not by CSS selector. Two elements with different text but overlapping selectors could theoretically both appear.

### Zod Dependency

`zod` is listed in `package.json` dependencies and marked as external in `tsup.config.ts`, but is not imported in any source file. It may be used by consumers who import from this package, or it may be vestigial.

---

## Build Configuration

- **Build tool**: tsup (ESM output, declarations, sourcemaps)
- **Entry**: `src/index.ts`
- **External**: `playwright`, `@browser-tester/cookies`, `zod`
- **Output**: `dist/index.js` + `dist/index.d.ts`
- **Test runner**: Vitest
- **Linter**: oxlint + tsc --noEmit

---

## Test Coverage

11 test files covering:

| Test file                        | What it tests                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `snapshot.test.ts`               | Tree/refs, nth disambiguation, locator resolution, interactive/compact/maxDepth filters, combined filters, diverse roles, edge cases |
| `act.test.ts`                    | Click, fill, checkbox, dynamic DOM, duplicate refs, select, snapshot option forwarding                                               |
| `create-page.test.ts`            | Cookie auto-detection (profile → sqlite fallback), video recording options (mocked Playwright)                                       |
| `diff.test.ts`                   | Identical, additions, removals, mixed, empty, completely different content                                                           |
| `compact-tree.test.ts`           | Empty tree, ref markers, structural pruning, nested ref preservation                                                                 |
| `friendly-error.test.ts`         | Strict mode, overlay, not visible, timeout, passthrough                                                                              |
| `get-indent-level.test.ts`       | Various indentation levels                                                                                                           |
| `parse-aria-line.test.ts`        | Role/name parsing, escaping, excluded roles                                                                                          |
| `resolve-locator.test.ts`        | Role+name, nth, exact match, selector-based                                                                                          |
| `resolve-nth-duplicates.test.ts` | Duplicate detection and nth assignment                                                                                               |
| `snapshot-stats.test.ts`         | Line/char/token counts, interactive vs total ref counts                                                                              |

Most tests use real Playwright (`chromium.launch`) with `page.setContent()`. Only `create-page.test.ts` uses mocks.
