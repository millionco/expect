# Browser Package Refactor

Rebuild `packages/browser` around two clean services with proper resource lifecycle.
Eliminate Playwright instance leaks, remove misplaced concerns (artifact persistence, live view, run state tracking).

---

## What's being removed from this package

- **Artifact persistence** — NDJSON writing, HTML report generation, `/tmp` copying, `.js` wrappers, `latest.json`, `steps.json`. This is orchestration-level work. The caller gets raw rrweb events back and decides what to do with them.
- **Live view server** — `live-view-server.ts`, SSE broadcasting, replay event polling/broadcasting. Moves to the CLI or a dedicated package.
- **Run state tracking** — `ViewerRunState`, `ViewerStepEvent`, `pushStepEvent`, `latestRunStateRef`. The browser package doesn't produce or consume test plan state.
- **Replay viewer HTML** — `replay-viewer.ts`, `buildReplayViewerHtml`. Moves out.
- **`ManagedRuntime`** — `mcp/runtime.ts`. The MCP server lifecycle is now managed by the `McpServer` service's scope.
- **Process signal handlers** — `start.ts` manual `SIGINT`/`SIGTERM`/`beforeExit` wiring. Replaced by Effect scope cleanup.
- **`runBrowser` convenience function** — consumers use the service directly.

---

## What stays

- **Snapshot engine** — `snapshot`, `annotatedScreenshot`, `act`, ref system, aria tree parsing, cursor-interactive detection. This is core browser automation.
- **rrweb recording** — runtime script injection, `collectEvents`, `collectAllEvents`. Recording is a browser concern. But the service returns raw events — it doesn't persist them.
- **Cookie extraction** — pre-extraction and injection via `@expect/cookies`. Stays as a browser launch concern.
- **Error types** — all existing errors stay. New errors added for lifecycle violations.
- **Diff/replay utilities** — `diffSnapshots`, `loadSession` stay as pure functions.

---

## Errors

```ts
// Existing errors — unchanged
export class BrowserLaunchError extends Schema.ErrorClass<BrowserLaunchError>(...)({ ... }) {}
export class NavigationError extends Schema.ErrorClass<NavigationError>(...)({ ... }) {}
export class SnapshotTimeoutError extends Schema.ErrorClass<SnapshotTimeoutError>(...)({ ... }) {}
export class RefNotFoundError extends Schema.ErrorClass<RefNotFoundError>(...)({ ... }) {}
export class RefAmbiguousError extends Schema.ErrorClass<RefAmbiguousError>(...)({ ... }) {}
export class RefBlockedError extends Schema.ErrorClass<RefBlockedError>(...)({ ... }) {}
export class RefNotVisibleError extends Schema.ErrorClass<RefNotVisibleError>(...)({ ... }) {}
export class ActionTimeoutError extends Schema.ErrorClass<ActionTimeoutError>(...)({ ... }) {}
export class ActionUnknownError extends Schema.ErrorClass<ActionUnknownError>(...)({ ... }) {}
export class RecorderInjectionError extends Schema.ErrorClass<RecorderInjectionError>(...)({ ... }) {}
export class SessionLoadError extends Schema.ErrorClass<SessionLoadError>(...)({ ... }) {}

// New errors
export class BrowserAlreadyOpenError extends Schema.ErrorClass<BrowserAlreadyOpenError>(
  "BrowserAlreadyOpenError",
)({
  _tag: Schema.tag("BrowserAlreadyOpenError"),
}) {
  message = "A browser is already open. Use the close tool first, then open a new session.";
}

export class BrowserNotOpenError extends Schema.ErrorClass<BrowserNotOpenError>(
  "BrowserNotOpenError",
)({
  _tag: Schema.tag("BrowserNotOpenError"),
}) {
  message = "No browser is open. Use the open tool with a URL to start a browser session first.";
}

export class McpServerStartError extends Schema.ErrorClass<McpServerStartError>(
  "McpServerStartError",
)({
  _tag: Schema.tag("McpServerStartError"),
  cause: Schema.String,
}) {
  message = `Failed to start MCP server: ${this.cause}. Check that no other browser MCP server is running on the same transport.`;
}
```

---

## Playwright Service

Replaces the old `Browser` service. Owns exactly one browser session at a time with explicit `open`/`close` lifecycle. The browser instance is a scoped resource — if the service's scope closes without an explicit `close`, the browser is still cleaned up.

### Why not RcRef/RcMap

`RcRef` and `RcMap` are reference-counted sharing primitives — multiple callers `get` the same resource and it stays alive until all refs are released. That's the wrong model here. We don't want shared access to a browser. We want **exclusive ownership**: one session open at a time, explicit open/close, error if you violate the protocol.

### Why not Ref

The MCP server processes tool calls sequentially — there's no concurrent access to the session. A plain `let session: BrowserSession | undefined` is simpler than `Ref<Option<...>>` and does the same thing. The `addFinalizer` reads the variable directly.

### Session state

```ts
let session: { browser: PlaywrightBrowser; context: BrowserContext; page: Page } | undefined;
```

`lastSnapshot` was only needed for the MCP `playwright` tool's `ref()` helper — that's MCP-level state tracked in `createMcpServer`, not here.

### Service signature

```ts
export class Playwright extends ServiceMap.Service<Playwright>()("@browser/Playwright", {
  make: Effect.gen(function* () {
    const artifacts = yield* Artifacts;
    let session: { browser: PlaywrightBrowser; context: BrowserContext; page: Page } | undefined;
    let planId: PlanId | undefined;

    // Safety net: if scope closes with an open session, close the browser.
    yield* Effect.addFinalizer(() =>
      session
        ? Effect.tryPromise(() => session!.browser.close()).pipe(
            Effect.ignore({ message: "Failed to close browser during scope finalization", log: "Warn" }),
          )
        : Effect.void,
    );

    const open = Effect.fn("Playwright.open")(function* (
      url: string,
      options: OpenOptions,
    ) {
      if (session) return yield* new BrowserAlreadyOpenError();

      // Launch chromium, create context, inject runtime, add cookies, create page, navigate.
      // Same logic as current Browser.createPage.
      // Starts rrweb recording.
      //
      // Sets up page listeners that push to Artifacts:
      //   page.on("console", msg => artifacts.push(new ConsoleLog({ planId, ... })))
      //   page.on("request", req => artifacts.push(new NetworkRequest({ planId, ... })))
      // ...

      planId = options.planId;
      session = { browser: launchedBrowser, context: newContext, page: newPage };
    });

    const close = Effect.fn("Playwright.close")(function* () {
      if (!session) return yield* new BrowserNotOpenError();
      const closing = session;
      session = undefined;

      // Collect final rrweb events and push to Artifacts (best-effort).
      yield* collectAllEvents(closing.page).pipe(
        Effect.tap((events) =>
          artifacts.push(...events.map((event) => new RrwebEvent({ planId: planId!, event }))),
        ),
        Effect.ignore({ message: "Failed to collect final rrweb events", log: "Warn" }),
      );

      planId = undefined;

      // Close the browser process.
      yield* Effect.tryPromise(() => closing.browser.close()).pipe(
        Effect.ignore({ message: "Failed to close browser process", log: "Warn" }),
      );
    });

    const assertPageExists = Effect.fn("Playwright.assertPageExists")(function* () {
      if (!session) return yield* new BrowserNotOpenError();
      return session.page;
    });

    const navigate = Effect.fn("Playwright.navigate")(function* (
      url: string,
      options: NavigateOptions = {},
    ) {
      const currentPage = yield* assertPageExists();
      yield* Effect.tryPromise({
        try: () => currentPage.goto(url, { waitUntil: options.waitUntil ?? "load" }),
        catch: (cause) =>
          new NavigationError({ url, cause: cause instanceof Error ? cause.message : String(cause) }),
      });
    });

    const snapshot = Effect.fn("Playwright.snapshot")(function* (options: SnapshotOptions = {}) {
      const currentPage = yield* assertPageExists();
      // Same aria snapshot logic as current Browser.snapshot.
      // ...
      return { tree, refs, stats, locator } satisfies SnapshotResult;
    });

    const act = Effect.fn("Playwright.act")(function* (
      ref: string,
      action: (locator: Locator) => Promise<void>,
      options?: SnapshotOptions,
    ) {
      yield* assertPageExists();
      const before = yield* snapshot(options);
      const locator = yield* before.locator(ref);
      yield* Effect.tryPromise({
        try: () => action(locator),
        catch: (error) => toActionError(error, ref),
      });
      return yield* snapshot(options);
    });

    const annotatedScreenshot = Effect.fn("Playwright.annotatedScreenshot")(function* (
      options: AnnotatedScreenshotOptions = {},
    ) {
      yield* assertPageExists();
      // Same logic as current Browser.annotatedScreenshot.
      // ...
      return { screenshot, annotations } satisfies AnnotatedScreenshotResult;
    });

    const waitForNavigationSettle = Effect.fn("Playwright.waitForNavigationSettle")(function* (
      urlBefore: string,
    ) {
      yield* assertPageExists();
      // Same logic as current Browser.waitForNavigationSettle.
    });

    return {
      open,
      close,
      navigate,
      snapshot,
      act,
      annotatedScreenshot,
      waitForNavigationSettle,
      assertPageExists,
      hasSession: () => Boolean(session),
    } as const;
  }),
}) {
  static layer = Layer.scoped(this)(this.make);
}
```

### Key differences from old `Browser`

| Old `Browser` | New `Playwright` |
|---|---|
| Stateless — `createPage` returns raw `{ browser, context, page }` | Stateful — owns browser/context/page, operations use the managed page |
| Caller responsible for `browser.close()` | `close()` method + scope finalizer guarantee cleanup |
| No protection against double-open | `BrowserAlreadyOpenError` on second `open` |
| Operations take `page` as argument | Operations use the internal session page |
| `close` is caller's problem | `close` returns void, scope finalizer guarantees cleanup |
| Cookie pre-extraction as a separate method | Cookie extraction happens inside `open` when `cookies: true` |

### `OpenOptions`

```ts
export interface OpenOptions {
  planId: PlanId;
  headed?: boolean;
  cookies?: boolean;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  executablePath?: string;
}
```

---

## Artifacts Service

Collects all session artifacts (console logs, network requests, rrweb events) in memory via a simple `push` API. Decouples artifact production (Playwright, MCP tools) from artifact consumption (persistence, live view, cloud upload).

The Playwright service pushes artifacts as they happen. Consumers subscribe or read when they need to. This is the extension point for future work — cloud upload, GitHub app integration, etc. just become new consumers of the same artifact stream.

### Artifact types

```ts
// PlanId from @expect/shared/models — the stable ID that links artifacts to a test run.

export class ConsoleLog extends Schema.TaggedClass<ConsoleLog>()("ConsoleLog", {
  planId: PlanId,
  type: Schema.String,
  text: Schema.String,
  timestamp: Schema.Number,
}) {}

export class NetworkRequest extends Schema.TaggedClass<NetworkRequest>()("NetworkRequest", {
  planId: PlanId,
  url: Schema.String,
  method: Schema.String,
  status: Schema.OptionFromUndefinedOr(Schema.Number),
  resourceType: Schema.String,
  timestamp: Schema.Number,
}) {}

export class RrwebEvent extends Schema.TaggedClass<RrwebEvent>()("RrwebEvent", {
  planId: PlanId,
  event: Schema.Unknown, // eventWithTime from @rrweb/types
}) {}

export const Artifact = Schema.Union(ConsoleLog, NetworkRequest, RrwebEvent);
export type Artifact = typeof Artifact.Type;
```

`PlanId` is passed into `Playwright.open` and stamped on every artifact. Consumers filter by `planId` to get artifacts for a specific test run.

### Service signature

```ts
export class Artifacts extends ServiceMap.Service<Artifacts>()("@browser/Artifacts", {
  make: Effect.gen(function* () {
    const items: Artifact[] = [];
    const pubsub = yield* PubSub.unbounded<Artifact>();

    const push = Effect.fn("Artifacts.push")(function* (...artifacts: Artifact[]) {
      for (const artifact of artifacts) {
        items.push(artifact);
        yield* PubSub.publish(pubsub, artifact);
      }
    });

    const stream = Stream.fromPubSub(pubsub);

    const all = () => items as readonly Artifact[];

    return { push, stream, all } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
```

### How it's used

**Playwright service** pushes artifacts during the session:
- `open` sets up page event listeners that push `ConsoleLog` and `NetworkRequest` artifacts
- rrweb event collection pushes `RrwebEvent` artifacts

**MCP tools** read from `Artifacts.all()` filtered by tag:
- `console_logs` tool → `artifacts.all().filter(a => a._tag === "ConsoleLog")`
- `network_requests` tool → `artifacts.all().filter(a => a._tag === "NetworkRequest")`

**Consumers** (outside the browser package) subscribe to `Artifacts.stream`:
- CLI live view server subscribes and broadcasts rrweb events via SSE
- CLI close handler reads all `RrwebEvent` artifacts and writes NDJSON/HTML
- Future: cloud uploader subscribes and streams artifacts to a remote API

This removes console/network tracking from `BrowserSession` entirely — the session just holds `{ browser, context, page }`.

---

## MCP Server Layer

Replaces the old `createBrowserMcpServer` + `startBrowserMcpServer` + `McpRuntime` + `start.ts`. This is a proper `ServiceMap.Service` with scoped lifecycle.

`lastSnapshot` is MCP-level state for the `playwright` tool's `ref()` helper.

Tool handlers need to run Effects but MCP callbacks are `() => Promise`. We capture the service context at construction time via `Effect.context()` and use `Effect.runPromise` with that context — no `ManagedRuntime` needed.

```ts
export const layerMcpServer = Layer.discardEffect(Effect.gen(function* () {
    const playwright = yield* Playwright;
    const artifacts = yield* Artifacts;

    // Capture live services so tool handlers can run Effects without a ManagedRuntime.
    const services = yield* Effect.services(Playwright, Artifacts);
    const run = Effect.runPromiseWith(services);

    const server = new McpServerSdk({ name: "expect", version: "0.0.1" });

    let lastSnapshot: SnapshotResult | undefined;

    // open
    server.registerTool("open", { ... }, ({ url, headed, cookies, waitUntil }) =>
      Effect.gen(function* () {
        const pw = yield* Playwright;
        if (pw.hasSession()) {
          yield* pw.navigate(url, { waitUntil });
          return textResult(`Navigated to ${url}`);
        }
        yield* pw.open(url, { headed, cookies, waitUntil });
        return textResult(`Opened ${url}`);
      }).pipe(run),
    );

    // screenshot
    server.registerTool("screenshot", { ... }, ({ mode, fullPage }) =>
      Effect.gen(function* () {
        const pw = yield* Playwright;
        if (mode === "snapshot") {
          const result = yield* pw.snapshot();
          lastSnapshot = result;
          return jsonResult({ tree: result.tree, refs: result.refs, stats: result.stats });
        }
        if (mode === "annotated") {
          const result = yield* pw.annotatedScreenshot({ fullPage });
          return imageAndTextResult(result);
        }
        const page = yield* pw.assertPageExists();
        const buffer = yield* Effect.tryPromise(() => page.screenshot({ fullPage }));
        return imageResult(buffer.toString("base64"));
      }).pipe(run),
    );

    // playwright — raw code execution
    server.registerTool("playwright", { ... }, ({ code }) =>
      Effect.gen(function* () {
        const pw = yield* Playwright;
        const page = yield* pw.assertPageExists();
        const ref = (refId: string) => {
          if (!lastSnapshot) throw new Error("No snapshot taken yet. Use screenshot with mode 'snapshot' first.");
          return Effect.runSync(lastSnapshot.locator(refId));
        };
        // AsyncFunction execution with page, context, browser, ref globals
        // ...
      }).pipe(run),
    );

    // console_logs
    server.registerTool("console_logs", { ... }, ({ type }) =>
      Effect.gen(function* () {
        const art = yield* Artifacts;
        const logs = art.all().filter(a => a._tag === "ConsoleLog");
        // filter by type, return
      }).pipe(run),
    );

    // network_requests
    server.registerTool("network_requests", { ... }, ({ method, url, resourceType }) =>
      Effect.gen(function* () {
        const art = yield* Artifacts;
        const requests = art.all().filter(a => a._tag === "NetworkRequest");
        // filter by method/url/resourceType, return
      }).pipe(run),
    );

    // performance_metrics
    server.registerTool("performance_metrics", { ... }, () =>
      Effect.gen(function* () {
        const pw = yield* Playwright;
        const page = yield* pw.assertPageExists();
        return yield* evaluateRuntime(page, "getPerformanceMetrics");
      }).pipe(run),
    );

    // close
    server.registerTool("close", { ... }, () =>
      Effect.gen(function* () {
        const pw = yield* Playwright;
        yield* pw.close();
        lastSnapshot = undefined;
        return textResult("Browser closed.");
      }).pipe(run),
    );

    // Start stdio transport
    const transport = new StdioServerTransport();
    yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => server.connect(transport),
        catch: (cause) =>
          new McpServerStartError({ cause: cause instanceof Error ? cause.message : String(cause) }),
      }),
      () =>
        Effect.tryPromise(() => server.close()).pipe(
          Effect.ignore({ message: "Failed to close MCP server", log: "Warn" }),
        ),
    );

})).pipe(
  Layer.provide(Playwright.layer),
  Layer.provide(Artifacts.layer),
);
```

### What `close` returns to the agent

`"Browser closed."` — that's it. Artifacts are already in the `Artifacts` service for anyone who needs them.

### Entry point (`start.ts`)

Becomes minimal:

```ts
import { Layer } from "effect";
import { NodeRuntime } from "@effect/platform-node";

Layer.launch(layerMcpServer).pipe(NodeRuntime.runMain);
```

`Layer.launch` builds the layer, keeps it alive, and tears it down on interruption. `NodeRuntime.runMain` handles `SIGINT`/`SIGTERM`. No manual signal handlers needed.

---

## Layer composition

```
Artifacts.layer           (in-memory artifact store)
Playwright.layer          (scoped — owns browser lifecycle, pushes to Artifacts)
  ← depends on Artifacts.layer, @expect/cookies
layerMcpServer           (scoped — owns MCP server + transport)
  ← provides Playwright.layer, Artifacts.layer
```

---

## What moves out

These concerns currently live in `packages/browser` but belong elsewhere:

| Concern | Current location | New owner |
|---|---|---|
| Artifact persistence (NDJSON, HTML, /tmp) | `McpSession.close()` | CLI / supervisor — subscribes to `Artifacts.stream` or reads `Artifacts.all()` and persists as needed |
| Live view SSE server | `live-view-server.ts` | CLI — subscribes to `Artifacts.stream` and broadcasts via SSE |
| Run state tracking | `McpSession.pushStepEvent` | CLI — already produces `ViewerRunState` from `ExecutedTestPlan`, just needs to push it to its own live view server |
| Replay viewer HTML | `replay-viewer.ts` | Shared package or CLI |
| `buildReplayViewerHtml` | `replay-viewer.ts` | Shared package or CLI |
| `ViewerRunState` / `ViewerStepEvent` types | `mcp/viewer-events.ts` | Shared package or CLI |

---

## Design decisions

- **Cookie pre-extraction** — fires eagerly in `Playwright.make` as a background fiber, same as today. By the time the agent calls `open`, cookies are already extracted. `open` reads the pre-extracted result if available, falls back to synchronous extraction if the fiber hasn't completed.
