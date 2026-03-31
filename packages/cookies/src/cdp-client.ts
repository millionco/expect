import os from "node:os";
import path from "node:path";
import {
  Effect,
  Layer,
  Schedule,
  Schema,
  ServiceMap,
  Array as Arr,
  Option,
  Deferred,
  Duration,
} from "effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import getPort from "get-port";
import {
  CpdInvalidResponsePayload,
  DebuggerUrlNotFoundError,
  ExtractionError,
  UnknownError,
} from "./errors";
import { Cookie } from "./types";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { HttpClient } from "effect/unstable/http/HttpClient";
import { HttpClientResponse } from "effect/unstable/http";
import { Socket } from "effect/unstable/socket/Socket";
import * as NodeSocket from "@effect/platform-node/NodeSocket";

const CDP_RETRY_COUNT = 15;
const CPD_COOKIE_READ_TIMEOUT: Duration.Input = "10 seconds";
const HEADLESS_CHROME_ARGS = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-address=127.0.0.1",
] as const;

const CdpCookieResponse = Schema.Struct({
  id: Schema.Number,
  error: Schema.optionalKey(
    Schema.Struct({
      code: Schema.Number,
      message: Schema.String,
    }),
  ),
  result: Schema.optionalKey(
    Schema.Struct({
      cookies: Schema.Array(Cookie),
    }),
  ),
});

export class CdpClient extends ServiceMap.Service<CdpClient>()("@cookies/CdpClient", {
  make: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const httpClient = yield* HttpClient;

    const tempBasePath = os.tmpdir();
    const tempEntries = yield* fs
      .readDirectory(tempBasePath)
      .pipe(Effect.catchTag("PlatformError", () => Effect.succeed([] as readonly string[])));
    const staleCdpDirectories = tempEntries.filter((entry) => entry.startsWith("cookies-cdp-"));
    if (staleCdpDirectories.length > 0) {
      yield* Effect.logInfo("Cleaning up stale CDP temp directories", {
        count: staleCdpDirectories.length,
      });
      yield* Effect.forEach(
        staleCdpDirectories,
        (entry) =>
          fs
            .remove(path.join(tempBasePath, entry), { recursive: true })
            .pipe(Effect.catchTag("PlatformError", () => Effect.void)),
        { concurrency: "unbounded" },
      );
    }

    const getAllCookies = Effect.fn("CdpClient.getAllCookies")(function* () {
      const socket = yield* Socket;
      const write = yield* socket.writer;
      const cookiesDeferred = yield* Deferred.make<readonly Cookie[], ExtractionError>();

      /** setup handler */
      yield* socket
        .runRaw((payload) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(CdpCookieResponse))(
              payload.toString(),
            );

            if (decoded.error) {
              return yield* Deferred.fail(
                cookiesDeferred,
                new ExtractionError({
                  reason: new CpdInvalidResponsePayload({
                    code: decoded.error.code,
                    errorMessage: decoded.error.message,
                  }),
                }),
              );
            }

            if (decoded.result) {
              yield* Deferred.succeed(cookiesDeferred, decoded.result.cookies);
            }
          }),
        )
        .pipe(
          Effect.tapCause((cause) =>
            Deferred.fail(
              cookiesDeferred,
              new ExtractionError({
                reason: new UnknownError({ cause }),
              }),
            ),
          ),
          Effect.forkScoped,
        );

      /** send payload */
      yield* write(JSON.stringify({ id: 1, method: "Network.getAllCookies" }));

      return yield* Deferred.await(cookiesDeferred).pipe(Effect.timeout(CPD_COOKIE_READ_TIMEOUT));
    });

    const extractCookies = Effect.fn("CdpClient.extractCookies")(function* ({
      key,
      profilePath,
      executablePath,
    }: {
      key: string;
      profilePath: string;
      executablePath: string;
    }) {
      const port = yield* Effect.tryPromise({
        try: () => getPort(),
        catch: (cause) =>
          new ExtractionError({ reason: new UnknownError({ cause: String(cause) }) }),
      });

      yield* Effect.annotateCurrentSpan({
        profilePath,
        executablePath,
      });

      const tempUserDataDirPath = yield* fs.makeTempDirectoryScoped({
        prefix: "cookies-cdp-",
      });

      const profileDirectoryName = path.basename(profilePath);
      const tempProfilePath = path.join(tempUserDataDirPath, profileDirectoryName);

      yield* fs.copy(profilePath, tempProfilePath);
      const localStatePath = path.join(path.dirname(profilePath), "Local State");
      if (yield* fs.exists(localStatePath)) {
        yield* fs.copyFile(localStatePath, path.join(tempUserDataDirPath, "Local State"));
      }

      yield* fs.writeFile(path.join(tempUserDataDirPath, "First Run"), new Uint8Array(0));

      const chromeArgs = [
        `--remote-debugging-port=${port}`,
        ...(key === "dia" ? [] : [`--user-data-dir=${tempUserDataDirPath}`]),
        `--profile-directory=${profileDirectoryName}`,
        ...HEADLESS_CHROME_ARGS,
      ];

      yield* ChildProcess.make(executablePath, chromeArgs, {
        stdin: "ignore",
      }).pipe(spawner.spawn, Effect.forkScoped);

      const debuggerUrl = yield* httpClient.get(`http://localhost:${port}/json`).pipe(
        Effect.flatMap(
          HttpClientResponse.schemaBodyJson(
            Schema.Array(
              Schema.Struct({
                type: Schema.String,
                webSocketDebuggerUrl: Schema.optionalKey(Schema.String),
              }),
            ),
          ),
        ),
        Effect.map(Arr.findFirst((target) => target.type === "page")),
        Effect.map(Option.flatMap((target) => Option.fromNullishOr(target.webSocketDebuggerUrl))),
        Effect.flatMap((debuggerUrlOption) => debuggerUrlOption.asEffect()),
        Effect.catchTag("NoSuchElementError", () =>
          new ExtractionError({
            reason: new DebuggerUrlNotFoundError(),
          }).asEffect(),
        ),
        Effect.retry({
          times: CDP_RETRY_COUNT,
          schedule: Schedule.exponential("100 millis"),
        }),
      );

      const cookies = yield* getAllCookies().pipe(
        Effect.provide(NodeSocket.layerWebSocket(debuggerUrl), {
          local: true,
        }),
      );
      yield* Effect.logInfo("CDP cookies extracted", {
        profile: profilePath,
        count: cookies.length,
      });
      return cookies;
    }, Effect.scoped);

    return { extractCookies } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(NodeServices.layer),
    /** @note(rasmus): unidici is more performant than fetch API on Node.js */
    Layer.provide(NodeHttpClient.layerUndici),
  );

  static layerTest = Layer.mock(this)({
    extractCookies: () => Effect.succeed([] as Cookie[]),
  });
}
