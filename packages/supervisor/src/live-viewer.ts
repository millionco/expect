import * as path from "node:path";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Predicate,
  Schema,
  ServiceMap,
  String as Str,
  Stream,
} from "effect";
import { Ndjson } from "effect/unstable/encoding";
import { LiveUpdatePayload } from "@expect/shared/rpcs";
import { PlanId, type TestPlan } from "@expect/shared/models";
import { NodeServices } from "@effect/platform-node";
import { GitRepoRoot } from "./git/git";
import { ensureStateDir } from "./utils/ensure-state-dir";
import { REPLAYS_DIRECTORY_NAME } from "./constants";
import { Tail } from "./tail";

export class ReplayCorruptedError extends Schema.ErrorClass<ReplayCorruptedError>(
  "ReplayCorruptedError",
)({
  _tag: Schema.tag("ReplayCorruptedError"),
  planId: Schema.String,
  reason: Schema.String,
}) {
  message = `Corrupted replay file for ${this.planId}: ${this.reason}`;
}

const replayPath = (replaysDir: string, planId: PlanId) =>
  path.join(replaysDir, `${planId}.ndjson`);

const LiveUpdatePayloadJson = Schema.toCodecJson(LiveUpdatePayload);
const encodePayload = Schema.encodeEffect(Schema.fromJsonString(LiveUpdatePayloadJson));

export class LiveViewer extends ServiceMap.Service<LiveViewer>()("@supervisor/LiveViewer", {
  make: Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const repoRoot = yield* GitRepoRoot;
    const tail = yield* Tail;

    const stateDir = yield* ensureStateDir(fileSystem, repoRoot);
    const replaysDir = path.join(stateDir, REPLAYS_DIRECTORY_NAME);
    yield* fileSystem
      .makeDirectory(replaysDir, { recursive: true })
      .pipe(Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.void));

    const appendLine = Effect.fnUntraced(function* (planId: PlanId, payload: LiveUpdatePayload) {
      const json = yield* encodePayload(payload).pipe(Effect.orDie);
      yield* fileSystem
        .writeFileString(replayPath(replaysDir, planId), json + "\n", {
          flag: "a",
        })
        .pipe(Effect.orDie);
    });

    const push = Effect.fn("LiveViewer.push")(function* (
      planId: PlanId,
      payload: LiveUpdatePayload,
    ) {
      yield* appendLine(planId, payload);
    });

    const stream = Effect.fn("LiveViewer.stream")(function* (planId: PlanId) {
      const filePath = replayPath(replaysDir, planId);
      return tail.stream(filePath).pipe(
        Stream.pipeThroughChannel(Ndjson.decodeSchema(LiveUpdatePayloadJson)()),
        Stream.orDie,
        Stream.takeWhile((payload) => payload._tag !== "Done"),
      );
    }, Stream.unwrap);

    const listTests = Effect.fn("LiveViewer.listTests")(function* () {
      const ndjsonFiles = yield* fileSystem
        .readDirectory(replaysDir)
        .pipe(Effect.map(Arr.filter(Str.endsWith(".ndjson"))), Effect.orDie);

      const plans = yield* Effect.forEach(
        ndjsonFiles,
        (fileName) => {
          const filePath = path.join(replaysDir, fileName);
          return fileSystem.stream(filePath).pipe(
            Stream.pipeThroughChannel(Ndjson.decodeSchema(LiveUpdatePayloadJson)()),
            Stream.runHead,
            Effect.orDie,
            Effect.flatMap((head) =>
              Effect.gen(function* () {
                const first = yield* head;
                if (first._tag !== "InitialPlan") return undefined;
                return first.plan as TestPlan;
              }),
            ),
            Effect.catchTag("NoSuchElementError", () => Effect.succeed(undefined)),
          );
        },
        { concurrency: "unbounded" },
      ).pipe(Effect.map(Arr.filter(Predicate.isNotUndefined)));

      return plans;
    });

    return { push, stream, listTests } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(Tail.layer),
    Layer.provide(NodeServices.layer),
  );
}
