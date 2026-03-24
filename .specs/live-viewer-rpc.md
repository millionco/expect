# Live Viewer RPC Refactor

## Problem

The MCP server process currently hosts a Vite dev server to serve the live viewer. This is wrong:

- The MCP server is a subprocess two hops away from the CLI (CLI -> Agent ACP adapter -> MCP server)
- The MCP server has no business running a Vite dev server
- The viewer uses hacky custom middleware (`testie-serve` plugin) to serve `.expect/` files
- Config is passed via env vars because there's no direct communication channel
- The live viewer HTML is not truly standalone — it fetches `.ndjson` files at runtime

## Architecture: Before

```
CLI process
  └─ spawns Agent ACP adapter
       └─ spawns Browser MCP server
            ├─ controls Chromium (Playwright + rrweb)
            ├─ polls rrweb events every 500ms
            ├─ runs Vite dev server for live viewer  ← wrong
            └─ writes .expect/ files on close
```

## Architecture: After

```
CLI process
  ├─ starts LiveViewer RPC server (WebSocket)    ← new, owned by CLI
  ├─ serves viewer React app (Vite)              ← new, owned by CLI
  ├─ receives ExecutionEvents from executor stream (already exists)
  └─ spawns Agent ACP adapter
       └─ spawns Browser MCP server
            ├─ controls Chromium (Playwright + rrweb)
            ├─ polls rrweb events every 500ms
            └─ pushes rrweb events to CLI via RPC  ← new
```

## Design

### 1. RPC Definition — `packages/shared/src/rpc/live-viewer.rpc.ts`

Following the ami-next pattern (`RpcGroup.make` + `.prefix`):

```ts
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ExecutionEvent } from "../models";

export const RrwebEvent = Schema.Unknown;
// rrweb's eventWithTime is complex and changes between versions.
// We treat it as opaque JSON — the viewer's rrweb-player deserializes it.

export const LiveUpdatePayload = Schema.Union([
  Schema.TaggedStruct("RrwebBatch", {
    events: Schema.Array(RrwebEvent),
  }),
  Schema.TaggedStruct("Execution", {
    event: ExecutionEvent,
  }),
]);
export type LiveUpdatePayload = typeof LiveUpdatePayload.Type;

const LiveViewerRpcsBase = RpcGroup.make(
  // MCP server calls this to push rrweb events to the CLI
  Rpc.make("PushRrwebEvents", {
    success: Schema.Void,
    payload: {
      events: Schema.Array(RrwebEvent),
    },
  }),

  // Viewer connects to this to get a merged stream of all live updates
  Rpc.make("StreamEvents", {
    success: LiveUpdatePayload,
    stream: true,
  }),
);

export const LiveViewerRpcs = LiveViewerRpcsBase.prefix("liveViewer.");
```

### 2. LiveViewer Service — `packages/supervisor/src/live-viewer.ts`

The service owns the PubSub and provides the RPC handlers. Lives in `packages/supervisor` because it depends on execution state (ExecutionEvents) which the supervisor already owns.

```ts
import { Effect, Layer, PubSub, Stream, ServiceMap } from "effect";
import type { LiveUpdatePayload } from "@expect/shared/rpc/live-viewer.rpc";
import type { ExecutionEvent } from "@expect/shared/models";
import type { eventWithTime } from "@rrweb/types";

export class LiveViewer extends ServiceMap.Service<LiveViewer>()("@supervisor/LiveViewer", {
  make: Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<LiveUpdatePayload>();

    const push = Effect.fn("LiveViewer.push")(
      function* (payload: LiveUpdatePayload) {
        yield* PubSub.publish(pubsub, payload);
      },
    );

    const stream = Stream.fromPubSub(pubsub);

    return { push, stream } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
```

### 3. RPC Layer — `packages/supervisor/src/rpc/live-viewer.rpc.layer.ts`

```ts
import { Effect, Layer } from "effect";
import { LiveViewerRpcs } from "@expect/shared/rpc/live-viewer.rpc";
import { LiveViewer } from "../live-viewer";

export const LiveViewerRpcsLive = LiveViewerRpcs.toLayer(
  Effect.gen(function* () {
    const liveViewer = yield* LiveViewer;

    return LiveViewerRpcs.of({
      "liveViewer.PushRrwebEvents": (req) => liveViewer.push({ _tag: "RrwebBatch", events: req.events }),
      "liveViewer.StreamEvents": () => liveViewer.stream,
    });
  }),
).pipe(Layer.provide(LiveViewer.layer));
```

### 4. RPC Server (WebSocket) — started by CLI

The CLI and MCP server agree on a fixed port for the LiveViewer RPC. Defined as a constant in `packages/shared` (e.g. `LIVE_VIEWER_RPC_PORT = 38930`). Both sides import it — no env var passing needed.

```ts
// packages/shared/src/ports.ts
export const LIVE_VIEWER_RPC_PORT = 38930;
export const LIVE_VIEWER_RPC_URL = `ws://localhost:${LIVE_VIEWER_RPC_PORT}/rpc`;
```

CLI starts the server:

```ts
const liveViewerServer = yield* RpcServer.layerHttp({
  group: LiveViewerRpcs,
  path: "/rpc",
}).pipe(Layer.provide(LiveViewerRpcsLive));
// served on LIVE_VIEWER_RPC_PORT
```

MCP server connects as a client using the same constant — no env vars, no URL passing.

### 5. MCP Server Changes — `packages/browser/src/mcp/mcp-session.ts`

Replace the broadcast + live view server with an RPC client call:

```ts
// Instead of:
//   const broadcast = yield* makeReplayBroadcast;
//   yield* startLiveViewServer(liveViewUrl, broadcast);
//
// Do:
const rpcClient = yield* LiveViewerRpcClient;

// In the polling fiber:
const pollPage = evaluateRecorderRuntime(page, "getEvents").pipe(
  Effect.tap((events) =>
    events.length > 0
      ? rpcClient("liveViewer.PushRrwebEvents", { events })
      : Effect.void,
  ),
);
```

The MCP server no longer owns any PubSub, broadcast, or Vite server. It just polls rrweb and pushes events upstream.

### 6. Viewer React App

#### RPC Client + Runtime — `packages/recorder/viewer/src/rpc/client.ts`

```ts
import { Layer, Logger, References } from "effect";
import { AtomRpc } from "effect/unstable/reactivity";
import * as Atom from "effect/unstable/reactivity/Atom";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { Socket } from "effect/unstable/socket";

import { LiveViewerRpcs } from "@expect/shared/rpc/live-viewer.rpc";
import { LIVE_VIEWER_RPC_PORT } from "@expect/shared/ports";

const protocol = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(
    Socket.layerWebSocket(`ws://localhost:${LIVE_VIEWER_RPC_PORT}/rpc`),
  ),
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provide(RpcSerialization.layerNdjson),
);

export class ViewerClient extends AtomRpc.Service<ViewerClient>()("ViewerClient", {
  group: LiveViewerRpcs,
  protocol,
}) {}

const ViewerLive = ViewerClient.layer.pipe(
  Layer.provideMerge(Layer.succeed(References.MinimumLogLevel)("Error")),
  Layer.provideMerge(Logger.layer([Logger.consolePretty()])),
);

export const ViewerRuntime = Atom.runtime(ViewerLive);
```

#### Atoms — `packages/recorder/viewer/src/atoms/live-updates.ts`

```ts
import { Effect, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import type { eventWithTime } from "@rrweb/types";

import { ViewerClient, ViewerRuntime } from "../rpc/client";
import type { LiveUpdatePayload } from "@expect/shared/rpc/live-viewer.rpc";
import type { ExecutionEvent } from "@expect/shared/models";

// Accumulated rrweb events for the player
export const rrwebEventsAtom = Atom.make<readonly eventWithTime[]>([]);

// Latest execution events for the steps panel
export const executionEventsAtom = Atom.make<readonly ExecutionEvent[]>([]);

// Stream consumer — subscribes on mount, pushes to atoms
export const liveUpdatesAtom = ViewerRuntime.pull(
  (get: Atom.Context) =>
    Effect.gen(function* () {
      const client = yield* ViewerClient;
      return client("liveViewer.StreamEvents", {}).pipe(
        Stream.tap((payload) =>
          Effect.sync(() => {
            if (payload._tag === "RrwebBatch") {
              Atom.unsafeSet(
                rrwebEventsAtom,
                [...Atom.unsafeGet(rrwebEventsAtom), ...payload.events] as readonly eventWithTime[],
              );
            } else {
              Atom.unsafeSet(
                executionEventsAtom,
                [...Atom.unsafeGet(executionEventsAtom), payload.event],
              );
            }
          }),
        ),
      );
    }),
);
```

#### App Component — `packages/recorder/viewer/src/app.tsx`

```tsx
import { useAtomValue } from "effect/unstable/reactivity/Atom";
import { RegistryProvider } from "@effect/atom-react";
import { rrwebEventsAtom, executionEventsAtom, liveUpdatesAtom } from "./atoms/live-updates";
import { ViewerRuntime } from "./rpc/client";
import { RrwebPlayer } from "./components/rrweb-player";
import { StepsPanel } from "./components/steps-panel";

const AppInner = () => {
  const rrwebEvents = useAtomValue(rrwebEventsAtom);
  const executionEvents = useAtomValue(executionEventsAtom);

  // Subscribe to the live update stream
  useAtomValue(liveUpdatesAtom);

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <StepsPanel events={executionEvents} />
      <RrwebPlayer events={rrwebEvents} />
    </div>
  );
};

export const App = () => (
  <RegistryProvider>
    <AppInner />
  </RegistryProvider>
);
```

#### Entry Point — `packages/recorder/viewer/src/main.tsx`

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./style.css";

createRoot(document.getElementById("root")!).render(<App />);
```

The viewer is a standalone React app. No custom middleware, no SSE, no file-serving plugins. It connects to the LiveViewer RPC via WebSocket and reactively updates atoms as events stream in.

### 7. Viewer Serving

The viewer React app is **built at package build time** via Vite (just as a bundler). At runtime, the CLI serves the pre-built static files using Effect's `HttpStaticServer` — no Vite dependency at runtime, no custom middleware.

Build: the `packages/recorder/viewer/` app is built by Vite into a static directory (e.g. `packages/recorder/dist/viewer/`).

Serving at runtime:

```ts
import { HttpStaticServer } from "effect/unstable/http";
import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { HttpRouter } from "effect/unstable/http";
import { createServer } from "node:http";

const VIEWER_STATIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "viewer");

const StaticFilesLive = HttpStaticServer.layer({
  root: VIEWER_STATIC_DIR,
  spa: true,  // all routes fall back to index.html
});

const layerViewerServer = (port: number) =>
  StaticFilesLive.pipe(
    Layer.provideMerge(HttpRouter.serve(StaticFilesLive)),
    Layer.provide(
      NodeHttpServer.layer(() => createServer(), { port }),
    ),
    Layer.provide(NodeServices.layer),
    Layer.provide(HttpRouter.layer),
  );
```

This serves the viewer SPA on one port. The RPC WebSocket runs on a separate port (or the same server, TBD). The viewer app connects to the RPC endpoint via WebSocket to get the event stream.

No Vite at runtime. No `testie-serve` middleware. No custom file-serving plugins. Just pre-built static files + a WebSocket RPC.

### 8. Execution Events Integration

The CLI already has `ExecutedTestPlan` updates via the executor stream (`Stream.tap` in `execution-atom.ts`). Wire the `onUpdate` callback to also push to `LiveViewer.pushExecutionEvent`:

```ts
// In execution-atom.ts
const finalExecuted = yield* executor.executePlan(input.testPlan).pipe(
  Stream.tap((executed) =>
    Effect.gen(function* () {
      input.onUpdate(executed);
      // Push latest event to live viewer
      const latestEvent = executed.events.at(-1);
      if (latestEvent) yield* liveViewer.push({ _tag: "Execution", event: latestEvent });
    }),
  ),
  Stream.runLast,
  // ...
);
```

## What Gets Deleted

- `packages/recorder/src/live-view-server.ts` — entire file
- `packages/recorder/src/replay-broadcast.ts` — entire file (LiveViewer service replaces it)
- `packages/recorder/viewer/vite.config.ts` — the `testie-serve` plugin
- `packages/browser/src/mcp/mcp-session.ts` — broadcast refs, live view refs, `startLiveViewServer` call, `flushBroadcastToFile`
- `EXPECT_LIVE_VIEW_URL_ENV_NAME` — no longer needed, replaced by shared constant
- All SSE-related code in the viewer app
- `packages/recorder/src/replay-viewer.ts` — `buildReplayViewerHtml` replaced by copying pre-built viewer + inlining data

## What Stays

- `packages/recorder/src/runtime/index.ts` — browser-side rrweb recording (unchanged)
- `packages/recorder/src/utils/evaluate-runtime.ts` — Playwright bridge (unchanged)
- `packages/recorder/viewer/src/` — React viewer app (refactored to use RPC WebSocket instead of SSE)
- rrweb event polling in MCP session (unchanged, but pushes to RPC instead of broadcast)
- Static report generation — reworked to copy pre-built viewer + inline data (see section 9)

### 9. Static Reports

`buildReplayViewerHtml` is deleted. Instead, static reports reuse the exact same viewer app.

#### Viewer source code

The viewer declares a global sentinel at the top level:

```ts
// packages/recorder/viewer/src/injected-events.ts
export const INJECTED_EVENTS: readonly LiveUpdatePayload[] | undefined =
  (globalThis as any).__EXPECT_INJECTED_EVENTS__;
```

#### The atom adapts with one line

```ts
// In live-updates.ts
export const liveUpdatesAtom = ViewerRuntime.pull(
  (get: Atom.Context) =>
    Effect.gen(function* () {
      // Static report: events are inlined in the HTML, no WebSocket needed
      if (INJECTED_EVENTS) {
        return Stream.fromIterable(INJECTED_EVENTS);
      }

      // Live mode: stream from RPC WebSocket
      const client = yield* ViewerClient;
      return client("liveViewer.StreamEvents", {});
    }),
);
```

Same atoms, same components, same rrweb-player, same steps panel. The only difference is where the stream comes from.

#### Viewer source code (preventing dead-code elimination)

The sentinel is defined directly in the bundle source so Vite doesn't optimize it away:

```ts
// packages/recorder/viewer/src/injected-events.ts

// @ts-ignore — replaced by string substitution when generating static reports
// biome-ignore lint: intentional unused-looking assignment
export const __EXPECT_INJECTED_EVENTS__: readonly LiveUpdatePayload[] | undefined = undefined;
```

#### Generating a static report

1. Copy the pre-built viewer directory to the report output path
2. Read the JS bundle, do a simple string replace:
   ```ts
   const bundle = readFileSync(bundlePath, "utf-8");
   const patched = bundle.replace(
     "__EXPECT_INJECTED_EVENTS__=void 0",  // Vite minifies `undefined` to `void 0`
     `__EXPECT_INJECTED_EVENTS__=${JSON.stringify(events)}`,
   );
   writeFileSync(bundlePath, patched);
   ```
3. Done — open the HTML file, it works offline with no server

No script tag injection, no HTML parsing. Just a string replace on the already-built bundle.

## Resolved Questions

1. **RPC transport**: `RpcServer.layerHttp` handles WebSocket upgrade automatically — WebSocket is the default protocol. No separate WebSocket layer needed. Same pattern as ami-next's `server.ts`. Use `RpcSerialization.layerNdjson` for message encoding.

2. **Port allocation**: Fixed port constant shared between CLI and MCP server (`LIVE_VIEWER_RPC_PORT`). No env vars.
