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
import { Artifact, PlanId, type TestPlan } from "@expect/shared/models";
import { NodeServices } from "@effect/platform-node";
import { GitRepoRoot } from "./git/git";
import { ensureStateDir } from "./utils/ensure-state-dir";
import { ARTIFACTS_DIRECTORY_NAME } from "./constants";
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

const artifactPath = (artifactsDir: string, planId: PlanId) =>
  path.join(artifactsDir, `${planId}.ndjson`);

const ArtifactJson = Schema.toCodecJson(Artifact);
const encodePayload = Schema.encodeEffect(Schema.fromJsonString(ArtifactJson));

export class ArtifactStore extends ServiceMap.Service<ArtifactStore>()(
  "@supervisor/ArtifactStore",
  {
    make: Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const repoRoot = yield* GitRepoRoot;
      const tail = yield* Tail;

      const stateDir = yield* ensureStateDir(fileSystem, repoRoot);
      const artifactsDir = path.join(stateDir, ARTIFACTS_DIRECTORY_NAME);
      yield* fileSystem
        .makeDirectory(artifactsDir, { recursive: true })
        .pipe(Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.void));

      const appendLine = Effect.fnUntraced(function* (planId: PlanId, payload: Artifact) {
        const json = yield* encodePayload(payload).pipe(Effect.orDie);
        yield* fileSystem
          .writeFileString(artifactPath(artifactsDir, planId), json + "\n", {
            flag: "a",
          })
          .pipe(Effect.orDie);
      });

      const push = Effect.fn("ArtifactStore.push")(function* (planId: PlanId, payload: Artifact) {
        yield* appendLine(planId, payload);
      });

      const stream = Effect.fn("ArtifactStore.stream")(function* (planId: PlanId) {
        const filePath = artifactPath(artifactsDir, planId);
        yield* Effect.logDebug(`Streaming artifacts from ${filePath}`);
        return tail.stream(filePath).pipe(
          Stream.pipeThroughChannel(Ndjson.decodeSchema(ArtifactJson)()),
          Stream.orDie,
          Stream.takeWhile((payload) => payload._tag !== "Done"),
        );
      }, Stream.unwrap);

      const readAll = Effect.fn("ArtifactStore.readAll")(function* (planId: PlanId) {
        const filePath = artifactPath(artifactsDir, planId);
        return yield* fileSystem
          .stream(filePath)
          .pipe(
            Stream.pipeThroughChannel(Ndjson.decodeSchema(ArtifactJson)()),
            Stream.runCollect,
            Effect.orDie,
          );
      });

      const listTests = Effect.fn("ArtifactStore.listTests")(function* () {
        const ndjsonFiles = yield* fileSystem
          .readDirectory(artifactsDir)
          .pipe(Effect.map(Arr.filter(Str.endsWith(".ndjson"))), Effect.orDie);

        const plans = yield* Effect.forEach(
          ndjsonFiles,
          (fileName) => {
            const filePath = path.join(artifactsDir, fileName);
            return fileSystem.stream(filePath).pipe(
              Stream.pipeThroughChannel(Ndjson.decodeSchema(ArtifactJson)()),
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

      return { push, stream, readAll, listTests } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(Tail.layer),
    Layer.provide(NodeServices.layer),
  );
}
