# @browser-tester/browser

Launch Playwright pages with cookie injection, accessibility snapshots, and ref-based interaction. Exposes an MCP server for agent-driven browser testing.

## Install

```bash
pnpm add @browser-tester/browser
```

## Quick Start

Use `runBrowser` to access the `Browser` Effect service with a pre-wired layer:

```ts
import { runBrowser } from "@browser-tester/browser";

await runBrowser(async (browser) => {
  const { page } = yield * browser.createPage("https://github.com", { headed: true });

  const { tree, refs, locator } = yield * browser.snapshot(page);
  console.log(tree);

  const result = yield * browser.act(page, "e1", async (el) => el.click());
  console.log(result.tree);
});
```

## Exports

### Main (`@browser-tester/browser`)

#### `Browser` Service

Effect service providing page creation, snapshots, and interaction.

| Method                    | Description                                                            |
| ------------------------- | ---------------------------------------------------------------------- |
| `createPage(url, opts?)`  | Launch a Chromium page, optionally injecting cookies                   |
| `snapshot(page, opts?)`   | Capture an accessibility tree with refs for each element               |
| `act(page, ref, action)`  | Perform an action on a ref, returns a fresh snapshot                   |
| `annotatedScreenshot`     | Take a screenshot with numbered overlay labels on interactive elements |
| `waitForNavigationSettle` | Wait for navigation to complete after a URL change                     |
| `preExtractCookies`       | Pre-extract cookies from the default browser                           |

#### `runBrowser(effect)`

Convenience wrapper that provides the `Browser` layer and runs via `Effect.runPromise`:

```ts
import { runBrowser } from "@browser-tester/browser";

const result = await runBrowser((browser) =>
  Effect.gen(function* () {
    const { page } = yield* browser.createPage("https://example.com");
    return yield* browser.snapshot(page);
  }),
);
```

#### `diffSnapshots(before, after)`

Compute a diff between two accessibility tree snapshots.

#### `buildReplayViewerHtml(events)`

Generate a self-contained HTML page for replaying recorded rrweb sessions.

#### `collectEvents` / `collectAllEvents` / `loadSession`

Utilities for working with recorded rrweb sessions.

#### Types

| Type                         | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `CreatePageOptions`          | Options for `createPage`                           |
| `SnapshotOptions`            | Options for `snapshot` (timeout, interactive, etc) |
| `SnapshotResult`             | Tree string, refs map, stats, and locator          |
| `SnapshotStats`              | Line/character/token/ref counts                    |
| `SnapshotDiff`               | Diff output with addition/removal counts           |
| `RefEntry`                   | Role, name, and nth index for a ref                |
| `RefMap`                     | Map of ref IDs to `RefEntry`                       |
| `Annotation`                 | Label, ref, role, and name for screenshot overlay  |
| `AnnotatedScreenshotOptions` | Extends `SnapshotOptions` with `fullPage`          |
| `AnnotatedScreenshotResult`  | Screenshot buffer and annotation list              |
| `CollectResult`              | Recorded events array and total count              |
| `AriaRole`                   | Playwright ARIA role type                          |

#### Re-exported Types

These types from `@browser-tester/cookies` are re-exported for convenience:

`BrowserKey` `Cookie` `ExtractOptions` `Browser` (as `BrowserProfile`)

#### Errors

| Error                    | Description                                  |
| ------------------------ | -------------------------------------------- |
| `BrowserLaunchError`     | Playwright browser failed to launch          |
| `SnapshotTimeoutError`   | Accessibility tree capture timed out         |
| `NavigationError`        | Page navigation failed                       |
| `RefNotFoundError`       | Ref ID not in current snapshot               |
| `RefAmbiguousError`      | Ref matched multiple elements                |
| `RefBlockedError`        | Ref is covered by an overlay                 |
| `RefNotVisibleError`     | Ref is not visible in viewport               |
| `ActionTimeoutError`     | Action on a ref timed out                    |
| `ActionUnknownError`     | Action on a ref failed for an unknown reason |
| `RecorderInjectionError` | rrweb recorder injection failed              |
| `SessionLoadError`       | Failed to load a recorded session            |
| `ActionError`            | Union type of all ref-related action errors  |

### MCP Subpath (`@browser-tester/browser/mcp`)

MCP server for agent-driven browser automation.

| Export                                  | Description                             |
| --------------------------------------- | --------------------------------------- |
| `createBrowserMcpServer()`              | Create an MCP server instance           |
| `startBrowserMcpServer()`               | Create and start serving over stdio     |
| `McpSession`                            | Session state management for MCP server |
| `McpRuntime`                            | Runtime lifecycle for MCP server        |
| `BROWSER_TESTER_LIVE_VIEW_URL_ENV_NAME` | Env var name for live view URL          |
| `BROWSER_TESTER_REPLAY_OUTPUT_ENV_NAME` | Env var name for replay output path     |

### CLI Subpath (`@browser-tester/browser/cli`)

Entry point that starts the browser MCP server. Used as a CLI binary.

### Runtime Subpath (`@browser-tester/browser/runtime`)

Functions injected into the browser page context via `evaluate`.

| Export                          | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `injectOverlayLabels`           | Add numbered labels to interactive elements      |
| `removeOverlay`                 | Remove injected overlay                          |
| `findCursorInteractiveElements` | Find elements with `cursor:pointer` / `onclick`  |
| `startRecording`                | Start rrweb recording                            |
| `stopRecording`                 | Stop rrweb recording                             |
| `getEvents`                     | Drain recorded events (destructive read)         |
| `getAllEvents`                  | Copy all recorded events (non-destructive)       |
| `getEventCount`                 | Number of buffered events                        |
| `CursorInteractiveResult`       | Interface for cursor-interactive element results |
