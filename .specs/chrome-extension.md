# Chrome Extension Injection

Load a custom Chrome MV3 extension into the headed Chromium instance so the user can steer
browser sessions and exchange messages with the Expect backend in real time.

---

## Architecture

The extension lives at `packages/browser/extension/` and is injected at Chromium launch
time via `--load-extension` / `--disable-extensions-except` flags. It only loads in
**headed** mode — headless runs skip it entirely.

```
CLI (--headed)
  → Executor sets EXPECT_EXTENSION_PATH in mcpEnv
    → MCP subprocess reads it via Config.option
      → McpSession passes extensionPath into createPage
        → Browser.createPage uses launchPersistentContext + flags
          → Chromium loads the extension
            → background.js opens WebSocket to MCP server
            → Comlink wraps the WebSocket: extension gets a typed proxy to backend API
            → Backend gets a typed proxy to extension API
```

### Why `launchPersistentContext`

Playwright's `browser.launch()` + `browser.newContext()` **cannot** load extensions.
The code must switch to `chromium.launchPersistentContext(userDataDir, ...)` when an
extension is present. Playwright also injects `--disable-extensions` and
`--disable-component-extensions-with-background-pages` by default, so these must be
stripped via `ignoreDefaultArgs`.

Use Playwright's bundled Chromium — real Chrome silently blocks `--load-extension`.

---

## Extension skeleton

Location: `packages/browser/extension/`

```
extension/
  manifest.json       # MV3 manifest: side_panel, background service worker, permissions
  background.js       # Bootstrap: fetch /health for token, maintain comms with backend
  sidepanel.html      # Side panel UI shell
  sidepanel.js        # Side panel logic: steering controls, activity feed
  sidepanel.css       # Styles
```

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "Expect",
  "version": "1.0.0",
  "description": "Expect browser testing extension",
  "permissions": ["sidePanel", "storage"],
  "host_permissions": ["http://127.0.0.1/*"],
  "background": {
    "service_worker": "background.js"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

### Comlink-based communication

The extension uses [Comlink](https://github.com/GoogleChromeLabs/comlink) for all
communication. Comlink turns message-passing channels into typed RPC — both sides expose
an object and call methods on the remote side as if they were local.

Three Comlink channels:

1. **background.js ↔ MCP server** — over WebSocket. The background service worker opens
   a WebSocket to `ws://127.0.0.1:<port>/extension-ws`. Both sides wrap the socket with
   a Comlink `MessagePort` adapter.

2. **background.js ↔ sidepanel.js** — over `chrome.runtime.connect()` (long-lived port).
   Wrapped with a Comlink adapter so the side panel gets a proxy to the background API.

3. **background.js ↔ content.js** (future) — same `chrome.runtime.connect()` pattern.

#### Backend API (exposed by MCP server, called by extension)

```ts
interface BackendApi {
  getState(): Promise<RunState>;
  steer(command: SteerCommand): Promise<void>;
  navigate(url: string): Promise<void>;
  getSnapshot(): Promise<SnapshotResult>;
}
```

The MCP server creates this object and exposes it via `Comlink.expose(backendApi, wsPort)`.

#### Extension API (exposed by background.js, called by MCP server)

```ts
interface ExtensionApi {
  onStateUpdate(state: RunState): void;
  onStepEvent(event: StepEvent): void;
  highlightElement(selector: string): void;
}
```

The background service worker exposes this via `Comlink.expose(extensionApi, wsPort)`.
The MCP server holds a `Comlink.wrap<ExtensionApi>(wsPort)` proxy and pushes state
updates through it — no polling needed.

#### WebSocket ↔ Comlink adapter

Comlink expects a `MessagePort`-like interface (`postMessage`, `addEventListener`).
A thin adapter wraps the WebSocket:

```ts
function wsEndpoint(ws: WebSocket): Comlink.Endpoint {
  return {
    postMessage: (data) => ws.send(JSON.stringify(data)),
    addEventListener: (_, handler) => {
      ws.addEventListener("message", (event) => {
        handler({ data: JSON.parse(event.data) });
      });
    },
    removeEventListener: (_, handler) => {
      ws.removeEventListener("message", handler);
    },
  };
}
```

Same adapter is used on both sides (extension and MCP server).

#### chrome.runtime.connect ↔ Comlink adapter

For background ↔ sidepanel communication over a Chrome long-lived port:

```ts
function chromePortEndpoint(port: chrome.runtime.Port): Comlink.Endpoint {
  return {
    postMessage: (data) => port.postMessage(data),
    addEventListener: (_, handler) => {
      port.onMessage.addListener((message) => handler({ data: message }));
    },
    removeEventListener: () => {},
  };
}
```

### background.js responsibilities

1. On install/startup, read server port from `chrome.storage.local` (default: well-known port)
2. Open WebSocket to `ws://127.0.0.1:<port>/extension-ws`
3. Wrap WebSocket with Comlink adapter, expose `ExtensionApi`, wrap remote as `BackendApi`
4. Accept `chrome.runtime.connect` from sidepanel, expose a proxy to `BackendApi` via Comlink
5. Forward `ExtensionApi` callbacks (state updates, step events) to sidepanel via Comlink

### sidepanel.js responsibilities

1. Connect to background via `chrome.runtime.connect({ name: "sidepanel" })`
2. Wrap the port with Comlink to get a typed proxy to `BackendApi`
3. Call `backendProxy.getState()`, `backendProxy.steer(...)` etc. as regular async calls
4. Receive state updates pushed from background via Comlink callbacks
5. Render steering UI and activity feed

---

## Code changes

### 1. `packages/browser/src/types.ts` — CreatePageOptions

Add `extensionPath?: string` to the interface. When set and `headed` is true, the launch
path switches to persistent context mode.

```ts
export interface CreatePageOptions {
  headed?: boolean;
  extensionPath?: string;       // ← new
  executablePath?: string;
  cookies?: boolean | Cookie[];
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  videoOutputDir?: string;
  cdpUrl?: string;
  browserType?: BrowserEngine;
}
```

### 2. `packages/browser/src/constants.ts` — Extension flags

```ts
export const EXTENSION_IGNORE_DEFAULT_ARGS = [
  "--disable-extensions",
  "--disable-component-extensions-with-background-pages",
];
```

### 3. `packages/browser/src/browser.ts` — Launch path fork

When `options.extensionPath` is set and `options.headed` is true:

```ts
// Extension path: use launchPersistentContext (mandatory for extensions)
const userDataDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "expect-ext-" });
const context = yield* Effect.tryPromise({
  try: () =>
    chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${options.extensionPath}`,
        `--load-extension=${options.extensionPath}`,
      ],
      ignoreDefaultArgs: EXTENSION_IGNORE_DEFAULT_ARGS,
    }),
  catch: toBrowserLaunchError,
});
// launchPersistentContext returns a BrowserContext directly, not a Browser
// Extract page from it, skip browser.newContext()
```

When `options.extensionPath` is set but `options.headed` is false:
- Log a warning: extensions are not supported in headless mode
- Fall through to normal `browserType.launch()` without the extension

Key detail: `launchPersistentContext` returns a `BrowserContext` (not a `Browser`).
The downstream code that calls `browser.newContext()` must be bypassed. The return shape
`{ browser, context, page }` changes — `browser` will be `undefined` or a shim when
using persistent context. The `close` path in `McpSession` calls `browser.close()` which
must become `context.close()` for the persistent context case.

### 4. `packages/browser/src/mcp/constants.ts` — Env var name

```ts
export const EXPECT_EXTENSION_PATH_ENV_NAME = "EXPECT_EXTENSION_PATH";
```

### 5. `packages/browser/src/mcp/mcp-session.ts` — Read env var, pass to createPage

```ts
const extensionPathConfig = yield* Config.option(
  Config.string(EXPECT_EXTENSION_PATH_ENV_NAME),
);
const extensionPath = Option.getOrUndefined(extensionPathConfig);
```

Pass into `browserService.createPage(url, { ..., extensionPath })`.

### 6. `packages/supervisor/src/executor.ts` — Wire into mcpEnv

Add `extensionPath?: string` to `ExecuteOptions`. When set, push it into `mcpEnv`:

```ts
if (options.extensionPath) {
  mcpEnv.push({ name: EXPECT_EXTENSION_PATH_ENV_NAME, value: options.extensionPath });
}
```

### 7. Extension path resolver

Add a helper (e.g. `packages/browser/src/utils/resolve-extension-path.ts`) that finds
the extension directory:

1. `EXPECT_EXTENSION_PATH` env var (explicit override)
2. `../../extension` relative to the source file (dev mode → `packages/browser/extension/`)
3. First path containing a `manifest.json` wins

### 8. WebSocket endpoint on MCP server

Add a `/extension-ws` WebSocket upgrade handler to the MCP server
(`packages/browser/src/mcp/server.ts`). On connection:

1. Wrap the WebSocket with the Comlink adapter
2. `Comlink.expose(backendApi, wsEndpoint)` — expose `BackendApi` to the extension
3. `Comlink.wrap<ExtensionApi>(wsEndpoint)` — get a proxy to push state into the extension

The server port is passed to the extension via `chrome.storage.local` (set during
persistent context launch) or defaults to a well-known port.

### 9. Comlink dependency

Add `comlink` as a dependency of `@expect/browser`. The extension files use it as a
vendored copy (bundled into `extension/vendor/comlink.min.js`) since MV3 service workers
cannot use bare module specifiers.

Alternatively, inline the ~3KB Comlink UMD bundle directly.

---

## Headless behavior

- **Headed mode (`--headed`)**: Extension loads normally, side panel available, WebSocket connected
- **Headless mode (default)**: Extension is **skipped** — log a debug message and launch
  with normal `browserType.launch()`. No off-screen window tricks.

---

## Data flow: Steering commands (via Comlink)

```
User clicks in side panel
  → sidepanel.js calls backendProxy.steer({ action: "click", selector: "#btn" })
    → Comlink serializes over chrome.runtime.Port to background.js
      → background.js forwards via Comlink over WebSocket
        → MCP server's BackendApi.steer() is called directly
          → McpSession applies steering
```

## Data flow: State updates (via Comlink)

```
McpSession state changes (step started, snapshot taken, etc.)
  → MCP server calls extensionProxy.onStateUpdate(newState)
    → Comlink serializes over WebSocket to background.js
      → background.js forwards via Comlink over chrome.runtime.Port
        → sidepanel.js callback fires, UI updates
```

No polling. Both directions are push-based through Comlink proxies.
