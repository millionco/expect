# Live Chrome Connection

Connect to a user's already-running Chrome (or Chromium-based browser) via CDP instead of launching Playwright's bundled Chromium. This gives the agent access to the user's authenticated state — cookies, sessions, extensions — without needing a clean browser.

## Problem

When an agent runs `open`, it launches Playwright's bundled Chromium — a clean browser with no cookies, sessions, or extensions. If you're testing a change behind auth (a dashboard, settings page, internal tool), the agent sees a login wall and can't proceed. The user's real Chrome already has all the sessions and state needed.

## How it works

The `@expect/browser` package includes utilities for discovering and connecting to a running Chrome:

```
Agent calls open tool with cdp="auto"
  → MCP server calls autoDiscoverCdp()
    → Scans Chrome user-data dirs for DevToolsActivePort files
    → Probes discovered ports via /json/version and /json/list
    → Returns a ws:// CDP endpoint URL
  → Passes cdpUrl to Browser.createPage
    → chromium.connectOverCDP(wsUrl)
    → Opens a new page in the user's browser
    → Agent tests against authenticated state
  → On close: only closes the page, not the user's browser
```

If discovery fails or the user doesn't have Chrome running, the MCP server falls back to bundled Chromium silently.

## Key components

### CDP auto-discovery (`packages/browser/src/cdp-discovery.ts`)

`autoDiscoverCdp()` scans known Chrome user-data directories for `DevToolsActivePort` files, which Chrome writes when launched with remote debugging enabled. It checks:

1. **macOS**: `~/Library/Application Support/{Google/Chrome, Chromium, BraveSoftware/Brave-Browser, Microsoft Edge, Arc/User Data, net.imput.helium}`
2. **Linux**: `~/.config/{google-chrome, chromium, BraveSoftware/Brave-Browser, microsoft-edge}`
3. **Windows**: `LOCALAPPDATA/{Google/Chrome, Chromium, BraveSoftware/Brave-Browser, Microsoft Edge}/User Data`

For each directory with a `DevToolsActivePort` file, it verifies the port is reachable, then tries `/json/version` and `/json/list` endpoints to get the `webSocketDebuggerUrl`.

Falls back to probing common CDP ports (9222, 9229) if no user-data dirs have active ports.

### DevToolsActivePort parser (`packages/browser/src/utils/parse-devtools-active-port.ts`)

Pure function that parses the `DevToolsActivePort` file format:

```
9222
/devtools/browser/abc-123-def
```

Line 1 is the port number, line 2 is the WebSocket path (defaults to `/devtools/browser` if absent).

### Chrome launcher (`packages/browser/src/chrome-launcher.ts`)

Utilities for finding and launching system Chrome (not currently wired into the main flow):

- `**findSystemChrome()**` — discovers installed Chrome/Chromium binary by OS (macOS app paths, Linux `which`, Windows program files)
- `**launchSystemChrome(options)**` — spawns Chrome with `--remote-debugging-port=0`, polls `DevToolsActivePort` until ready, returns `{ process, wsUrl, userDataDir }`
- `**killChromeProcess(chrome)**` — kills the child process and cleans up temp user-data dir

### MCP integration

The MCP `open` tool accepts a `cdp` parameter:

- **Explicit URL**: `cdp="ws://localhost:9222/devtools/browser/..."` — connects directly
- **Auto-discover**: `cdp="auto"` — runs `autoDiscoverCdp()` to find a running Chrome
- **Omitted**: launches bundled Chromium (default)

When connected to an external browser (`isExternalBrowser=true`), `close` only closes the page — it never kills the user's browser process.

## Important: browser security dialogs

Chromium-based browsers may show an "Allow remote debugging?" dialog when an external process connects via CDP. This is why auto-discovery is **not** always-on — it must be explicitly requested via `cdp="auto"` to avoid spamming users with permission dialogs on every page creation.

## Error types

- `CdpDiscoveryError` — no running Chrome found or all discovery methods failed
- `CdpConnectionError` — found a CDP endpoint but `connectOverCDP` failed
- `ChromeNotFoundError` — no system Chrome installation found (for `findSystemChrome`)
- `ChromeLaunchTimeoutError` — Chrome process started but didn't produce a CDP URL in time (for `launchSystemChrome`)

