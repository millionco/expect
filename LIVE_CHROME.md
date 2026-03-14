# Recreating Live Chrome Support

Live Chrome was removed from the codebase. This document describes how to re-implement it if needed. It covers every layer of the stack: browser connection, orchestrator routing, MCP server tools, CLI flags, and agent prompts.

## Overview

Live Chrome lets testie connect to the user's running Chrome session via the Chrome DevTools Protocol (CDP) instead of launching a headless Chromium instance. It supports two connection modes and two tab modes:

- **Connection modes**: "prompt" (Chrome's permission-prompt flow via `chrome-devtools-mcp`) or "cdp" (direct CDP WebSocket connection)
- **Tab modes**: "new" (open a fresh tab in the existing session) or "attach" (bind to an existing open tab by URL match, title match, or index)

## 1. packages/browser

### CreatePageOptions

Add these fields to `CreatePageOptions` in `src/types.ts`:

```ts
interface CreatePageOptions {
  // ...existing fields...
  liveChrome?: boolean;
  cdpEndpoint?: string;
  tabMode?: "attach" | "new";
  tabUrlMatch?: string;
  tabTitleMatch?: string;
  tabIndex?: number;
}
```

### CreatePageResult ownership flags

Re-add `ownsBrowser` and `ownsPage` to `CreatePageResult` in `src/types.ts` (these were removed when live Chrome was stripped):

```ts
interface CreatePageResult {
  browser: PlaywrightBrowser;
  context: BrowserContext;
  page: Page;
  ownsBrowser: boolean;
  ownsPage: boolean;
}
```

The launched path should return `{ ownsBrowser: true, ownsPage: true }`. In live Chrome mode:

- `ownsBrowser` is always `false` (we connected to the user's Chrome, not our own)
- `ownsPage` is `true` if we opened a new tab, `false` if we attached to an existing tab

### create-page.ts

Add a `createLiveChromePage` function alongside the existing `createPage`. The flow:

1. Resolve the CDP endpoint: use `cdpEndpoint` if provided, otherwise auto-detect from Chrome's `DevToolsActivePort` file on macOS at `~/Library/Application Support/Google/Chrome/DevToolsActivePort`
2. Connect via `chromium.connectOverCDP(endpoint)` from Playwright
3. If `tabMode === "attach"`: scan existing tabs (most recent first) and match by `tabIndex`, `tabUrlMatch`, or `tabTitleMatch`. Return with `ownsBrowser: false, ownsPage: false`.
4. If `tabMode === "new"` (default): call `context.newPage()`. Return with `ownsBrowser: false, ownsPage: true`.
5. In `createPage`, branch on `options.liveChrome` — call `createLiveChromePage` or the existing launch path.
6. The existing launch path needs to return `ownsBrowser: true, ownsPage: true` again (currently returns `{ browser, context, page }` without ownership flags).

### CDP endpoint auto-detection

Create `src/utils/resolve-live-chrome-cdp-endpoint.ts`:

1. If `cdpEndpoint` is provided, return it directly
2. On macOS, read `~/Library/Application Support/Google/Chrome/DevToolsActivePort`
3. Parse the port number (first line) and WebSocket path (second line)
4. Return `ws://127.0.0.1:{port}{websocketPath}`
5. On non-macOS platforms, throw an error asking the user to pass `--cdp-endpoint`

### Constants

Add to `src/constants.ts`:

- `LIVE_CHROME_REMOTE_DEBUGGING_HELP_URL = "chrome://inspect/#remote-debugging"`
- `LIVE_CHROME_MACOS_USER_DATA_DIR_SEGMENTS = ["Library", "Application Support", "Google", "Chrome"]`

## 2. packages/orchestrator

### BrowserEnvironmentHints

Add these fields to `BrowserEnvironmentHints` in `src/types.ts`:

```ts
interface BrowserEnvironmentHints {
  // ...existing fields (baseUrl, headed, cookies)...
  liveChrome?: boolean;
  liveChromeConnectionMode?: "prompt" | "cdp";
  liveChromeCdpEndpoint?: string;
  liveChromeTabMode?: "attach" | "new";
  liveChromeTabUrlMatch?: string;
  liveChromeTabTitleMatch?: string;
  liveChromeTabIndex?: number;
}
```

### Connection mode resolution

Add `resolveLiveChromeConnectionMode(environment)` to `src/browser-mcp-config.ts`:

```ts
const resolveLiveChromeConnectionMode = (
  environment: BrowserEnvironmentHints | undefined,
): "prompt" | "cdp" | undefined => {
  if (environment?.liveChrome !== true) return undefined;
  if (environment.liveChromeConnectionMode) return environment.liveChromeConnectionMode;
  return environment.liveChromeCdpEndpoint ? "cdp" : "prompt";
};
```

### MCP server selection

In `buildBrowserMcpSettings`:

- Re-add `environment` to the options interface
- Branch on connection mode:
  - **prompt**: spawn `chrome-devtools-mcp@latest` via npx with `--autoConnect` flag
  - **cdp**: spawn the normal `@browser-tester/mcp` with live Chrome config passed as env vars

### Environment variable bridge

When connection mode is "cdp", pass config to the MCP child process via environment variables:

| Env var                                      | Source field              |
| -------------------------------------------- | ------------------------- |
| `BROWSER_TESTER_LIVE_CHROME`                 | `"true"`                  |
| `BROWSER_TESTER_LIVE_CHROME_CDP_ENDPOINT`    | `liveChromeCdpEndpoint`   |
| `BROWSER_TESTER_LIVE_CHROME_TAB_MODE`        | `liveChromeTabMode`       |
| `BROWSER_TESTER_LIVE_CHROME_TAB_URL_MATCH`   | `liveChromeTabUrlMatch`   |
| `BROWSER_TESTER_LIVE_CHROME_TAB_TITLE_MATCH` | `liveChromeTabTitleMatch` |
| `BROWSER_TESTER_LIVE_CHROME_TAB_INDEX`       | `liveChromeTabIndex`      |

Add these to `buildBrowserMcpServerEnv()`, which currently only handles the video output path.

### Planning prompt

Add live Chrome environment hints to `buildPlanningPrompt()` in the "Environment hints:" section:

```
- Live Chrome mode: yes/no
- Live Chrome connection mode: prompt/cdp
- Live Chrome CDP endpoint: ...
- Live Chrome tab mode: attach/new
- Live Chrome tab URL match: ...
- Live Chrome tab title match: ...
- Live Chrome tab index: ...
```

Add planning requirements:

- Shape the plan around the tab-mode hint when live Chrome is enabled
- In prompt mode, assume reuse of the user's signed-in session after Chrome shows a permission prompt
- In attach mode, prefer continuing an existing workflow on an open tab
- In new-tab mode, prefer opening a fresh tab in the existing session

### Execution prompt

Add live Chrome instructions to `buildExecutionPrompt()`:

- Tell the agent video recording may be unavailable in live Chrome mode
- In prompt mode: explain Chrome may ask the user to allow access, recommend `list_pages` then `select_page` for attach mode or `new_page` for new-tab mode
- In cdp mode: explain the MCP server is pre-configured, recommend the `attach` tool for attach mode
- Tell the agent not to close the user's browser tabs (only clean up tabs it created)
- Skip video output path when live Chrome is enabled (change `const videoOutputPath = options.videoOutputPath ?? createVideoOutputPath()` to conditionally skip)

### Fatal error detection

Add `shouldAbortForLiveChromeToolError()` to detect unrecoverable connection failures and throw immediately instead of letting the agent retry:

CDP fatal fragments:

- "Could not auto-connect to live Chrome"
- "Could not connect to live Chrome"
- "Connected to Chrome, but no browser context was available"

Prompt fatal fragments:

- "Could not connect to Chrome."
- "chrome://inspect/#remote-debugging"
- "ProtocolError: Network.enable timed out"
- "The socket connection was closed unexpectedly"

Call this in the tool-result handler of `executeBrowserFlow`.

## 3. packages/mcp

### Re-add ownership tracking to BrowserSession

The `BrowserSession` interface currently has no ownership fields. Re-add:

```ts
interface BrowserSession {
  // ...existing fields...
  ownsBrowser: boolean;
  ownsPages: Set<Page>;
}
```

Also re-add to `ClosedSessionResult`:

```ts
interface ClosedSessionResult {
  savedVideoPath: string | null;
  ownsBrowser: boolean;
  closedOwnedPages: number;
}
```

### Re-add closeOwnedPages

Add a function that closes only pages the session created (for disconnect without killing user tabs):

```ts
const closeOwnedPages = async (browserSession: BrowserSession): Promise<number> => {
  if (browserSession.ownsBrowser) return 0;
  let closedOwnedPages = 0;
  for (const page of browserSession.ownsPages) {
    if (page.isClosed()) continue;
    await page.close();
    closedOwnedPages += 1;
  }
  return closedOwnedPages;
};
```

### Re-add ownership guard in saveSessionVideo

Currently `saveSessionVideo` always saves. Add a guard: `if (!browserSession.ownsBrowser) return null;` since we can't control video recording on a browser we didn't launch.

### Environment variable reading

Add `readConfiguredLiveChromeOptions()` that reads the `BROWSER_TESTER_LIVE_CHROME_*` env vars and returns a `LiveChromeConnectionOptions` object (a subset of `CreatePageOptions`).

### Options merging

Add `resolveLiveChromeOptions(toolOptions, overrides)` that merges:

1. Options passed directly by the tool call (highest priority)
2. Explicit overrides (e.g. `{ liveChrome: true, tabMode: "attach" }` for the attach tool)
3. Options from environment variables (lowest priority)

### Tool input schema

Define `liveChromeInputSchema` (Zod) with fields: `liveChrome`, `cdpEndpoint`, `tabMode`, `tabUrlMatch`, `tabTitleMatch`, `tabIndex`.

### Open tool changes

Spread `...liveChromeInputSchema` into the `open` tool's input schema. In the handler:

1. Call `resolveLiveChromeOptions()` with the tool's live Chrome args
2. Spread the resolved options into `createPage(url, { ...liveChromeOptions, headed, cookies, ... })`
3. Set `ownsBrowser` and `ownsPages` on the session based on the `CreatePageResult`
4. Set `videoOutputPath` only when `ownsBrowser` is true
5. Return different messages for live Chrome ("Connected to live Chrome and opened a new tab / attached to an existing tab") vs launched ("Opened {url}")

### Attach tool

Register an `attach` tool that:

1. Rejects if a session already exists
2. Calls `resolveLiveChromeOptions` with `{ liveChrome: true, tabMode: "attach" }` as overrides
3. Calls `createPage(undefined, { ...liveChromeOptions })`
4. Sets up the session with `ownsBrowser: false`

### Close tool changes

When closing:

- If `ownsBrowser` is true: close the browser normally (current behavior)
- If `ownsBrowser` is false and owned pages exist: close only the pages the session created, then disconnect
- If `ownsBrowser` is false and no owned pages: just disconnect
- Messages: "Disconnected from live Chrome. Closed N browser-tester tab(s)." or "Disconnected from live Chrome."

### Tab close changes

Before closing a tab, check `!session.ownsBrowser && !session.ownsPages.has(targetPage)`. If the tab wasn't created by the session, refuse: "Refusing to close a user-owned tab in live Chrome mode."

### Tab create changes

When a new tab is created via `tab_create`, add it to `session.ownsPages`.

### Tab list changes

Re-add `ownedBySession: session.ownsPages.has(tabPage)` to the tab list output so the agent knows which tabs are safe to close.

### Save video changes

If `!session.ownsBrowser`, return "Video saving is unavailable in live Chrome mode."

## 4. apps/cli

### Commander flags

Add these options to the root program (all subcommands inherit via `optsWithGlobals()`):

```
--live-chrome              Connect to your existing Chrome session
--cdp-endpoint <url>       Use a manual CDP endpoint instead of Chrome's permission prompt flow
--attach-tab               Attach to an existing tab in live Chrome
--new-tab                  Open a fresh tab in live Chrome
--tab-url <match>          Attach to a tab whose URL includes this text
--tab-title <match>        Attach to a tab whose title includes this text
--tab-index <number>       Attach to a tab by index
```

### CLI args resolution

Create `src/utils/resolve-live-chrome-args.ts` with a `resolveLiveChromeEnvironment(args)` function that:

1. If `--live-chrome` is not set, validates that no other live Chrome flags are set (throws if they are)
2. Validates `--attach-tab` and `--new-tab` are not both set
3. Validates tab selectors are not used with `--new-tab`
4. Infers tab mode from flags: if `--attach-tab` or any tab selector is set, use "attach"; otherwise "new"
5. Returns a `BrowserEnvironmentHints` with all the live Chrome fields populated

### Zustand store integration

The CLI now uses Zustand for state management. To support live Chrome in the TUI:

1. Add `environmentOverrides: BrowserEnvironmentHints` to the store state
2. In `index.tsx`, resolve the CLI flags into `BrowserEnvironmentHints` and set on the store before rendering
3. In the planning effect (`usePlanningEffect` in `app.tsx`), pass `environmentOverrides` from the store to `generateBrowserPlan()`
4. In `utils/browser-agent.ts`, re-add `environmentOverrides?: BrowserEnvironmentHints` to `GenerateBrowserPlanOptions` and re-add the `mergeBrowserEnvironment` function that spreads overrides onto the base environment

### Browser tool call formatting

Re-add the `"attach"` case to `utils/format-browser-tool-call.ts`:

```ts
case "attach":
  return "Attach live Chrome tab";
```

### Automated mode for default command

When `--live-chrome` is set on the default command (no subcommand), bypass the TUI and run `autoDetectAndTest()` with the environment overrides.

### Non-interactive output

In `run-test.ts`, add `formatLiveChromeMode(environment)` that produces a human-readable summary like:

- "Live Chrome mode: open new tab by requesting access to your existing Chrome session"
- "Live Chrome mode: attach existing tab via ws://127.0.0.1:9222 (url contains '/onboarding')"

Log this before the plan summary. Also log a help message about enabling remote debugging.

## Design notes for a first-class implementation

The original implementation had architectural issues worth addressing if re-implementing:

1. **Nest the config**: Instead of 7 flat `liveChrome*` fields on `BrowserEnvironmentHints`, use `liveChrome?: LiveChromeConfig` where presence of the object means enabled. This eliminates the `liveChrome: true` boolean plus 6 optional fields pattern.

2. **Deduplicate connection mode resolution**: The original had identical `resolveLiveChromeConnectionMode` in both `apps/cli/src/utils/run-test.ts` and `packages/orchestrator/src/browser-mcp-config.ts`. Define it once in the orchestrator and import.

3. **Consistent field naming**: Use the same names across `CreatePageOptions` (`tabMode`), `BrowserEnvironmentHints` (`liveChromeTabMode`), and env vars (`BROWSER_TESTER_LIVE_CHROME_TAB_MODE`). Consider aligning on the short names.

4. **TUI integration**: Instead of bypassing the TUI with `--live-chrome`, make it a toggleable option in the main menu alongside `auto-run after planning`. The environment overrides flow through the Zustand store naturally.

5. **Connection mode is orchestrator-only**: The browser package just checks whether `cdpEndpoint` is set. The "prompt" vs "cdp" distinction is an orchestrator routing decision (which MCP server to spawn), not a browser config concept. Keep it out of the browser package.
