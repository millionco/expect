import { describe, it, assert } from "vite-plus/test";
import { Effect, Layer } from "effect";
import { CurrentPlanId, PlanId } from "@expect/shared/models";
import { DEFAULT_REPLAY_HOST, LIVE_VIEWER_STATIC_PORT } from "@expect/shared";
import { layerArtifactViewerProxy } from "../src/artifact-server";
import { ReplayHost } from "../src/replay-host";
import { Headers } from "effect/unstable/http";

const liveLayer = layerArtifactViewerProxy.pipe(
  Layer.provide(Layer.succeed(ReplayHost, DEFAULT_REPLAY_HOST)),
  Layer.provide(Layer.succeed(CurrentPlanId, PlanId.makeUnsafe("test-live"))),
);

const proxyUrl = `http://localhost:${LIVE_VIEWER_STATIC_PORT}`;

const runLive = <A>(effect: Effect.Effect<A>) =>
  effect.pipe(Effect.scoped, Effect.provide(liveLayer), Effect.runPromise);

const PER_REQUEST_HEADERS = new Set([
  "date",
  "age",
  "x-vercel-id",
  "connection",
  "keep-alive",
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

const headersToRecord = (headers: Headers): Record<string, string> => {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!PER_REQUEST_HEADERS.has(key)) {
      record[key] = value;
    }
  });
  return record;
};

describe("live viewer proxy (production expect.dev)", () => {
  it(
    "replay page: proxy response exactly matches direct response",
    () =>
      runLive(
        Effect.gen(function* () {
          const [direct, proxied] = yield* Effect.promise(() =>
            Promise.all([
              globalThis.fetch("https://www.expect.dev/replay"),
              globalThis.fetch(`${proxyUrl}/replay`),
            ]),
          );

          assert.strictEqual(proxied.status, direct.status);

          const [directBody, proxiedBody] = yield* Effect.promise(() =>
            Promise.all([direct.text(), proxied.text()]),
          );
          assert.strictEqual(proxiedBody, directBody);

          const directHeaders = headersToRecord(direct.headers);
          const proxiedHeaders = headersToRecord(proxied.headers);
          assert.deepStrictEqual(proxiedHeaders, directHeaders);
        }),
      ),
    30_000,
  );

  it(
    "homepage: proxy response exactly matches direct response",
    () =>
      runLive(
        Effect.gen(function* () {
          const [direct, proxied] = yield* Effect.promise(() =>
            Promise.all([
              globalThis.fetch("https://www.expect.dev/"),
              globalThis.fetch(`${proxyUrl}/`),
            ]),
          );

          assert.strictEqual(proxied.status, direct.status);

          const [directBody, proxiedBody] = yield* Effect.promise(() =>
            Promise.all([direct.text(), proxied.text()]),
          );
          assert.strictEqual(proxiedBody, directBody);

          const directHeaders = headersToRecord(direct.headers);
          const proxiedHeaders = headersToRecord(proxied.headers);
          assert.deepStrictEqual(proxiedHeaders, directHeaders);
        }),
      ),
    30_000,
  );
});
