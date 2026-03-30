# Multi-Tenant Live Viewer

Make the live viewer multi-tenant: each test run (identified by `PlanId`) has its own event stream, and the viewer lets you select which test to watch.

---

## Current state (single-tenant)

- `LiveViewer` service has a single `PubSub<LiveUpdatePayload>` with `replay: Infinity`
- `PushRrwebEvents` pushes to this single pubsub, `StreamEvents` streams from it
- The viewer connects and gets everything — no concept of "which test"
- Replays are saved per-plan at `.expect/replays/{planId}.ndjson` by the Executor (not LiveViewer's concern currently)
- The viewer has one `liveUpdatesAtom` that streams all events
- `LiveUpdatePayload` stores the full `ExecutedTestPlan` on every emission — wasteful

## Target state (multi-tenant)

Each test run has its own event stream keyed by `PlanId`. The viewer shows a dropdown to pick a test, syncs selection to URL search params, and streams events for that specific test. Data is stored as granular deltas (initial plan + raw `AcpSessionUpdate` events), not full snapshots.

---

## LiveUpdatePayload redesign

### `packages/shared/src/rpc/live-viewer.rpc.ts`

The current payload stores the full `ExecutedTestPlan` on every emission. Instead, store granular events and let the consumer reduce them:

```ts
export const LiveUpdatePayload = Schema.Union([
  Schema.TaggedStruct("RrwebBatch", {
    events: Schema.Array(RrwebEvent),
  }),
  Schema.TaggedStruct("InitialPlan", {
    plan: TestPlan,
  }),
  Schema.TaggedStruct("SessionUpdate", {
    update: AcpSessionUpdate,
  }),
]);
```

**Why:** With the old approach, every emission contained the entire `ExecutedTestPlan` (all accumulated events). Now we store `InitialPlan` once, then individual `SessionUpdate` deltas. The ndjson files on disk shrink dramatically, and the consumer reduces them using `ExecutedTestPlan.addEvent()` which already exists.

---

## RPC changes

### `packages/shared/src/rpc/live-viewer.rpc.ts`

```ts
const LiveViewerRpcsBase = RpcGroup.make(
  Rpc.make("PushRrwebEvents", {
    success: Schema.Void,
    payload: {
      planId: PlanId,
      events: Schema.Array(RrwebEvent),
    },
  }),

  Rpc.make("StreamEvents", {
    success: LiveUpdatePayload,
    stream: true,
    payload: {
      planId: PlanId,
    },
  }),

  Rpc.make("ListTests", {
    success: Schema.Array(TestPlan),
  }),
);
```

- `PushRrwebEvents` and `StreamEvents` both take `planId`
- `ListTests` returns `TestPlan[]` — contains title, steps, changesFor, etc. No need to reduce the full event stream just for listing metadata

---

## LiveViewer service — centralized persistence via RcMap

### `packages/supervisor/src/live-viewer.ts`

The LiveViewer owns all persistence. The Executor just pushes events — it doesn't write ndjson files. LiveViewer uses `RcMap` to manage per-plan PubSub resources with automatic disk flush on scope close.

```ts
export class LiveViewer extends ServiceMap.Service<LiveViewer>()("@supervisor/LiveViewer", {
  make: Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const repoRoot = yield* GitRepoRoot;

    // Ensure replays directory exists at layer construction time
    const stateDir = yield* ensureStateDir(fileSystem, repoRoot);
    const replaysDir = path.join(stateDir, REPLAYS_DIRECTORY_NAME);
    yield* fileSystem.makeDirectory(replaysDir, { recursive: true })
      .pipe(Effect.catchTag("PlatformError", () => Effect.void));

    const channels = yield* RcMap.make({
      lookup: (planId: PlanId) =>
        Effect.gen(function* () {
          const pubsub = yield* PubSub.unbounded<LiveUpdatePayload>({ replay: Infinity });

          // On scope close, flush the pubsub's replay buffer to disk as ndjson
          yield* Effect.addFinalizer(() =>
            Effect.gen(function* () {
              const outputPath = path.join(replaysDir, `${planId}.ndjson`);
              yield* Stream.fromPubSub(pubsub).pipe(
                Stream.pipeThroughChannel(Ndjson.encodeSchema(LiveUpdatePayload)()),
                Stream.run(fileSystem.sink(outputPath)),
              );
              yield* Effect.logInfo("Replay saved to disk", { planId, outputPath });
            }),
          );

          return pubsub;
        }),
    });

    const push = Effect.fn("LiveViewer.push")(function* (
      planId: PlanId,
      payload: LiveUpdatePayload,
    ) {
      const pubsub = yield* RcMap.get(channels, planId).pipe(Effect.scoped);
      yield* PubSub.publish(pubsub, payload);
    });

    const stream = Effect.fn("LiveViewer.stream")(function* (planId: PlanId) {
      // If there's an active in-memory channel, stream from it
      // Otherwise, stream from the ndjson file on disk
      const hasActive = /* check RcMap state for planId */;
      if (hasActive) {
        const pubsub = yield* RcMap.get(channels, planId).pipe(Effect.scoped);
        return Stream.fromPubSub(pubsub);
      }
      // Replay from disk
      const filePath = path.join(replaysDir, `${planId}.ndjson`);
      return fileSystem.stream(filePath).pipe(
        Stream.pipeThroughChannel(Ndjson.decodeSchema(LiveUpdatePayload)()),
      );
    });

    const listTests = Effect.fn("LiveViewer.listTests")(function* () {
      const entries = yield* fileSystem.readDirectory(replaysDir);
      const ndjsonFiles = entries.filter((entry) => entry.endsWith(".ndjson"));

      // Read the first line of each ndjson file — it must be an InitialPlan.
      // If it's not, the file is corrupted and we surface the error.
      return yield* Effect.forEach(ndjsonFiles, (fileName) =>
        Effect.gen(function* () {
          const filePath = path.join(replaysDir, fileName);
          const head = yield* fileSystem.stream(filePath).pipe(
            Stream.pipeThroughChannel(Ndjson.decodeSchema(LiveUpdatePayload)()),
            Stream.runHead,
          );
          const first = yield* head;
          if (first._tag !== "InitialPlan") {
            return yield* new ReplayCorruptedError({ planId: fileName, reason: `Expected InitialPlan as first line, got ${first._tag}` });
          }
          return first.plan;
        }),
        { concurrency: "unbounded" },
      );
    });

    return { push, stream, listTests } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(Updates.layer),
    Layer.provide(NodeServices.layer),
  );
}
```

**Errors:**

```ts
export class ReplayCorruptedError extends Schema.ErrorClass<ReplayCorruptedError>(
  "ReplayCorruptedError",
)({
  _tag: Schema.tag("ReplayCorruptedError"),
  planId: Schema.String,
  reason: Schema.String,
}) {
  message = `Corrupted replay file for ${this.planId}: ${this.reason}`;
}
```

**Key design decisions:**
- Replays directory is created once at layer construction time — `listTests` never needs to check if it exists
- `RcMap` manages per-plan PubSub lifecycle. When a plan's scope closes (test run ends, no more consumers), the finalizer flushes all accumulated events to `.expect/replays/{planId}.ndjson` using `Ndjson.encodeSchema`. Errors in the finalizer bubble up (no swallowing)
- `stream()` checks for an active in-memory channel first; falls back to `fileSystem.stream(path).pipe(Stream.pipeThroughChannel(Ndjson.decodeSchema(LiveUpdatePayload)()))` for historical replays
- `listTests()` only reads the first `InitialPlan` line from each ndjson file — no need to reduce the full stream just to get metadata. Returns `TestPlan[]` (not `ExecutedTestPlan[]`)
- Errors from reading ndjson files bubble up — if a file is corrupted, the user sees the error rather than silently losing test entries
- Executor no longer writes ndjson files — that's LiveViewer's responsibility

---

## Executor changes

### `packages/supervisor/src/executor.ts`

Remove all replay file writing. The Executor only pushes events to `LiveViewer`.

```ts
// Before (remove):
const replayOutputPath = path.join(process.cwd(), EXPECT_STATE_DIR, "replays", `${planId}.ndjson`);

// After: Executor just pushes deltas
// 1. Push InitialPlan once at the start
yield* liveViewer.push(planId, { _tag: "InitialPlan", plan: syntheticPlan });

// 2. In the stream accumulator, push SessionUpdate for each raw AcpSessionUpdate
Stream.tap((update) => liveViewer.push(planId, { _tag: "SessionUpdate", update })),

// 3. RrwebBatch events continue flowing through PushRrwebEvents RPC from the browser
```

The `EXPECT_REPLAY_OUTPUT_ENV_NAME` / `EXPECT_REPLAY_OUTPUT_PATH` env var is no longer needed for the executor. Remove it.

---

## CurrentPlanId service

### `packages/supervisor/src/current-plan-id.ts` (new)

```ts
import { ServiceMap } from "effect";
import type { PlanId } from "@expect/shared/models";

export class CurrentPlanId extends ServiceMap.Service<CurrentPlanId, PlanId>()("@supervisor/CurrentPlanId") {}
```

When `layerCli` is built, a new `PlanId` is generated and provided as `CurrentPlanId`. Services that need the plan ID can `yield* CurrentPlanId` instead of having it threaded through as a parameter.

---

## Browser MCP client changes

### `packages/browser/src/artifacts-rpc.ts`

Read `EXPECT_PLAN_ID` using `Config.string`:

```ts
const planId = yield* Config.string("EXPECT_PLAN_ID").pipe(
  Effect.map(PlanId.makeUnsafe),
);

// Then in the push call:
rpcClient("liveViewer.PushRrwebEvents", { planId, events });
```

### `packages/supervisor/src/constants.ts`

```ts
export const EXPECT_PLAN_ID_ENV_NAME = "EXPECT_PLAN_ID";
```

### Executor env injection

In `executor.ts`, add `EXPECT_PLAN_ID` to the MCP env:

```ts
const mcpEnv = [{ name: EXPECT_PLAN_ID_ENV_NAME, value: planId }];
```

---

## RPC layer changes

### `packages/supervisor/src/rpc/live-viewer.rpc.layer.ts`

```ts
export const LiveViewerRpcsLive = LiveViewerRpcs.toLayer(
  Effect.gen(function* () {
    const liveViewer = yield* LiveViewer;

    return LiveViewerRpcs.of({
      "liveViewer.PushRrwebEvents": (request) =>
        Effect.tap(
          liveViewer.push(request.planId, { _tag: "RrwebBatch", events: request.events }),
          () => Effect.logInfo("PushRrwebEvents received", {
            planId: request.planId,
            eventCount: request.events.length,
          }),
        ),
      "liveViewer.StreamEvents": (request) =>
        Stream.unwrap(liveViewer.stream(request.planId)),
      "liveViewer.ListTests": () => liveViewer.listTests,
    });
  }),
).pipe(Layer.provide(LiveViewer.layer));
```

---

## Viewer changes

### New atom: `packages/recorder/viewer/src/atoms/selected-test.ts`

```ts
import * as Atom from "effect/unstable/reactivity/Atom";
import { PlanId } from "@expect/shared/models";

export const selectedTestIdAtom = Atom.searchParam("testId", {
  schema: PlanId,
});
```

Syncs with `?testId=<planId>` in the URL. Type is `Option<PlanId>` — when `None`, no test is selected (show list view).

### New atom: `packages/recorder/viewer/src/atoms/test-list.ts`

```ts
import { Effect } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ViewerClient, ViewerRuntime } from "../rpc/client";
import type { TestPlan } from "@expect/shared/models";

export const testListAtom = ViewerRuntime.pull(() =>
  Effect.gen(function* () {
    const client = yield* ViewerClient;
    return yield* client("liveViewer.ListTests", undefined);
  }),
).pipe(Atom.keepAlive);
// Type: Atom<AsyncResult<TestPlan[]>>
```

### Updated atom: `packages/recorder/viewer/src/atoms/live-updates.ts`

Derive from `selectedTestIdAtom`. The stream now emits granular `LiveUpdatePayload` events that the component reduces into `ExecutedTestPlan`:

```ts
export const liveUpdatesAtom = ViewerRuntime.pull((ctx) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* ViewerClient;
      if (__EXPECT_INJECTED_EVENTS__) {
        return Stream.fromIterable(__EXPECT_INJECTED_EVENTS__);
      }
      const planId = yield* ctx.some(selectedTestIdAtom);
      return client("liveViewer.StreamEvents", { planId });
    }),
  ),
).pipe(Atom.keepAlive);
```

When `selectedTestIdAtom` is `None`, `ctx.some` suspends the atom (no stream). When a test is selected, it streams that test's events.

### Updated component: `packages/recorder/viewer/src/app.tsx`

The `App` component needs to reduce `LiveUpdatePayload` events into `ExecutedTestPlan`:

```ts
// In the component that consumes liveUpdatesAtom:
// Accumulate: InitialPlan sets the base, SessionUpdate calls addEvent, RrwebBatch collects events
```

Add a `TestSelector` dropdown at the top:

```tsx
function TestSelector() {
  const testList = useAtomValue(testListAtom);
  const [selectedId, setSelectedId] = useAtom(selectedTestIdAtom);

  return AsyncResult.builder(testList)
    .onWaiting(() => <div>Loading tests...</div>)
    .onSuccess((tests) => {
      if (tests.length === 0) {
        return <EmptyState />;
      }
      return (
        <select
          value={Option.getOrElse(selectedId, () => "")}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedId(value ? Option.some(PlanId.makeUnsafe(value)) : Option.none());
          }}
        >
          <option value="">Select a test run...</option>
          {tests.map((test) => (
            <option key={test.id} value={test.id}>
              {test.title} — {test.steps.length} steps
            </option>
          ))}
        </select>
      );
    })
    .orNull();
}
```

**Empty state:** When no tests exist (first run), show an appropriate empty state (e.g. "No test runs yet. Run `expect` to create your first test.") instead of a blank page.

---

## Static report (injected events) path

When `__EXPECT_INJECTED_EVENTS__` is set (static HTML report), the test selector is hidden — events are baked in for a single test. The `selectedTestIdAtom` is irrelevant in this mode since `liveUpdatesAtom` short-circuits. The injected events should use the new `LiveUpdatePayload` format (granular deltas).

---

## Files to change

| File | Change |
|------|--------|
| `packages/shared/src/rpc/live-viewer.rpc.ts` | Redesign `LiveUpdatePayload` (InitialPlan + SessionUpdate + RrwebBatch), add `planId` to RPCs, add `ListTests` returning `TestPlan[]` |
| `packages/shared/src/models.ts` | Export `AcpSessionUpdate` if not already exported from shared |
| `packages/supervisor/src/live-viewer.ts` | `RcMap` for per-plan PubSubs, `addFinalizer` flushes to ndjson on scope close, `stream` with memory/disk fallback, `listTests` reads first `InitialPlan` line from each ndjson file, replays dir ensured at construction time |
| `packages/supervisor/src/rpc/live-viewer.rpc.layer.ts` | Wire new RPC signatures with `planId` |
| `packages/supervisor/src/executor.ts` | Remove ndjson file writing, push `InitialPlan` once then `SessionUpdate` deltas, add `EXPECT_PLAN_ID` to mcpEnv |
| `packages/supervisor/src/current-plan-id.ts` | **New** — `CurrentPlanId` service |
| `packages/supervisor/src/constants.ts` | Add `EXPECT_PLAN_ID_ENV_NAME`, `REPLAYS_DIRECTORY_NAME` |
| `packages/browser/src/artifacts-rpc.ts` | Use `Config.string("EXPECT_PLAN_ID")` to read planId, pass to `PushRrwebEvents` |
| `packages/recorder/viewer/src/atoms/selected-test.ts` | **New** — `Atom.searchParam("testId", { schema: PlanId })` |
| `packages/recorder/viewer/src/atoms/test-list.ts` | **New** — `testListAtom` calling `ListTests` |
| `packages/recorder/viewer/src/atoms/live-updates.ts` | Derive from `selectedTestIdAtom` via `ctx.some` |
| `packages/recorder/viewer/src/app.tsx` | Add `TestSelector` dropdown, reduce granular payloads into `ExecutedTestPlan`, empty state for no tests |
| `apps/cli/src/layers.ts` | Provide `CurrentPlanId` in `layerCli` |

---

## Data flow

```
Executor
  │ push(planId, InitialPlan { plan })          ← once at start
  │ push(planId, SessionUpdate { update })      ← per AcpSessionUpdate delta
  ▼
LiveViewer (RcMap<PlanId, PubSub>)
  │ In-memory: PubSub per plan with replay: Infinity
  │ On scope close: flush via Ndjson.encodeSchema → .expect/replays/{planId}.ndjson
  ▼
Browser MCP → PushRrwebEvents(planId, events)
  │ push(planId, RrwebBatch { events })
  ▼
Viewer (StreamEvents { planId })
  │ Active plan? → Stream.fromPubSub(channel)
  │ Historical?  → fs.stream(path) |> Ndjson.decodeSchema(LiveUpdatePayload)
  ▼
React: reduce InitialPlan + SessionUpdates → ExecutedTestPlan via addEvent()
```

---

## Edge cases

- **First run (no replays on disk):** `ListTests` returns `[]`. Viewer shows empty state with guidance.
- **Active test run:** In-memory PubSub streams live. Not yet on disk (flushed on scope close).
- **URL with `?testId=<invalid>`:** `PlanId` schema decode fails, `selectedTestIdAtom` is `Option.none()`, falls back to list view.
- **Static report mode:** `__EXPECT_INJECTED_EVENTS__` short-circuits — no RPC, no selector.
- **Multiple concurrent runs:** Each has its own PubSub in the `RcMap`, naturally isolated.
- **Corrupted ndjson file:** If the first line isn't `InitialPlan`, surfaces a `ReplayCorruptedError`. Empty files hit `NoSuchElementError` from `yield* head` (Option.none). Either way the user sees a clear error, not a mysteriously missing test.

---

## Non-goals

- Deleting old test runs from `.expect/replays/`
- Pagination of test list
- Real-time updates to the test list (polling/streaming new entries)
- Authentication on the RPC server
