import { Effect, Layer, Predicate, ServiceMap } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Schema } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { chromium, type Browser } from "playwright";
import * as path from "node:path";
import { createRequire } from "node:module";

const MAX_SCALE_VALUE = 2.5;
const TIMEOUT_BUFFER_MS = 120_000;
const DEFAULT_RESOLUTION_RATIO = 0.8;
const META_EVENT_TYPE = 4;

const resolveRrwebAssets = Effect.fn("RrVideo.resolveRrwebAssets")(function* () {
  const fileSystem = yield* FileSystem;
  const require = createRequire(import.meta.url);
  const rrwebEntry = yield* Effect.try({
    try: () => require.resolve("rrweb"),
    catch: (cause) =>
      new RrVideoConvertError({
        cause: `Failed to resolve rrweb package: ${String(cause)}`,
      }),
  });
  const rrwebUmdPath = path.resolve(rrwebEntry, "../../dist/rrweb.umd.cjs");
  const rrwebStylePath = path.resolve(rrwebEntry, "../../dist/style.css");
  const rrwebScript = yield* fileSystem.readFileString(rrwebUmdPath).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      new RrVideoConvertError({
        cause: `Failed to read rrweb script: ${cause}`,
      }).asEffect(),
    ),
  );
  const rrwebStyle = yield* fileSystem.readFileString(rrwebStylePath).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      new RrVideoConvertError({
        cause: `Failed to read rrweb style: ${cause}`,
      }).asEffect(),
    ),
  );
  return { rrwebScript, rrwebStyle };
});

export class RrVideoConvertError extends Schema.ErrorClass<RrVideoConvertError>(
  "RrVideoConvertError",
)({
  _tag: Schema.tag("RrVideoConvertError"),
  cause: Schema.String,
}) {
  message = `Failed to convert rrweb session to video: ${this.cause}`;
}

interface ConvertOptions {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly resolutionRatio?: number;
  readonly onProgress?: (percent: number) => void;
  readonly speed?: number;
  readonly skipInactive?: boolean;
}

const buildReplayHtml = (
  eventsJson: string,
  rrwebScript: string,
  rrwebStyle: string,
  scaleFactor: number,
  config: { speed?: number; skipInactive?: boolean },
) => `
<html>
  <head>
  <style>${rrwebStyle}</style>
  <style>
    html, body { padding: 0; border: none; margin: 0; overflow: hidden; }
    .replayer-wrapper { transform: scale(${scaleFactor}) translate(-50%, -50%); transform-origin: top left; position: absolute; top: 50%; left: 50%; }
  </style>
  </head>
  <body>
    <div id="player"></div>
    <script>
      ${rrwebScript};
      /*<!--*/
      const events = ${eventsJson.replace(/<\/script>/g, "<\\/script>")};
      /*-->*/
      try {
        const replayer = new rrweb.Replayer(events, {
          root: document.getElementById('player'),
          skipInactive: ${Boolean(config.skipInactive)},
          speed: ${config.speed ?? 1},
          mouseTail: true,
        });
        replayer.on('finish', () => window.onReplayFinish());
        replayer.on('event-cast', (event) => {
          if (events.length > 1) {
            const first = events[0].timestamp;
            const last = events[events.length - 1].timestamp;
            const progress = (event.timestamp - first) / (last - first);
            window.onReplayProgressUpdate(progress);
          }
        });
        replayer.play();
      } catch (error) {
        console.error('Error initializing replayer:', error);
        window.onReplayFinish();
      }
    </script>
  </body>
</html>
`;

interface RrwebEvent {
  readonly type: number;
  readonly timestamp: number;
  readonly data: { readonly width?: number; readonly height?: number };
}

const isRrwebEvent = (value: unknown): value is RrwebEvent =>
  Predicate.isObject(value) &&
  "type" in value &&
  typeof value.type === "number" &&
  "timestamp" in value &&
  typeof value.timestamp === "number";

const getMaxViewport = (events: readonly RrwebEvent[]) => {
  let maxWidth = 0;
  let maxHeight = 0;
  for (const event of events) {
    if (event.type !== META_EVENT_TYPE) continue;
    if ((event.data.width ?? 0) > maxWidth) maxWidth = event.data.width ?? 0;
    if ((event.data.height ?? 0) > maxHeight) maxHeight = event.data.height ?? 0;
  }
  return { width: maxWidth, height: maxHeight };
};

interface RrwebAssets {
  readonly rrwebScript: string;
  readonly rrwebStyle: string;
}

interface ReplayOptions {
  readonly eventsJson: string;
  readonly scaleFactor: number;
  readonly scaledViewport: { readonly width: number; readonly height: number };
  readonly totalTimeout: number;
  readonly tempVideoDir: string;
  readonly replayConfig: {
    readonly speed?: number;
    readonly skipInactive?: boolean;
  };
  readonly rrwebAssets: RrwebAssets;
  readonly onProgress?: (percent: number) => void;
}

const closeContext = (context: import("playwright").BrowserContext) =>
  Effect.promise(() => context.close()).pipe(
    Effect.catchCause((cause) => Effect.logDebug("Failed to close browser context", { cause })),
  );

const replayToVideo = Effect.fn("RrVideo.replayToVideo")(function* (
  browser: Browser,
  options: ReplayOptions,
) {
  const context = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        browser.newContext({
          viewport: options.scaledViewport,
          recordVideo: {
            dir: options.tempVideoDir,
            size: options.scaledViewport,
          },
        }),
      catch: (cause) =>
        new RrVideoConvertError({
          cause: `Failed to create browser context: ${String(cause)}`,
        }),
    }),
    closeContext,
  );

  const page = yield* Effect.tryPromise({
    try: () => context.newPage(),
    catch: (cause) =>
      new RrVideoConvertError({
        cause: `Failed to create page: ${String(cause)}`,
      }),
  });

  yield* Effect.tryPromise({
    try: async () => {
      await page.goto("about:blank");
      await page.exposeFunction("onReplayProgressUpdate", (progress: number) => {
        options.onProgress?.(progress);
      });
    },
    catch: (cause) =>
      new RrVideoConvertError({
        cause: `Failed to set up page: ${String(cause)}`,
      }),
  });

  yield* Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Replay timed out"));
        }, options.totalTimeout);

        void page
          .exposeFunction("onReplayFinish", () => {
            clearTimeout(timeout);
            resolve();
          })
          .then(() =>
            page.setContent(
              buildReplayHtml(
                options.eventsJson,
                options.rrwebAssets.rrwebScript,
                options.rrwebAssets.rrwebStyle,
                options.scaleFactor,
                options.replayConfig,
              ),
            ),
          )
          .catch((error) => {
            clearTimeout(timeout);
            reject(error);
          });
      }),
    catch: (cause) =>
      new RrVideoConvertError({
        cause: `Replay execution failed: ${String(cause)}`,
      }),
  });

  const videoPath = yield* Effect.tryPromise({
    try: async () => (await page.video()?.path()) ?? "",
    catch: (cause) =>
      new RrVideoConvertError({
        cause: `Failed to get video path: ${String(cause)}`,
      }),
  });

  if (!videoPath) {
    return yield* new RrVideoConvertError({
      cause: "No video file produced by Playwright",
    });
  }

  return videoPath;
}, Effect.scoped);

export class RrVideo extends ServiceMap.Service<RrVideo>()("@expect/browser/RrVideo", {
  make: Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const rrwebAssets = yield* resolveRrwebAssets();

    const acquireBrowser = Effect.acquireRelease(
      Effect.tryPromise({
        try: () => chromium.launch({ headless: true }),
        catch: (cause) =>
          new RrVideoConvertError({
            cause: `Failed to launch browser: ${String(cause)}`,
          }),
      }),
      (browser) =>
        Effect.promise(() => browser.close()).pipe(
          Effect.catchCause((cause) => Effect.logDebug("Failed to close browser", { cause })),
        ),
    );

    const convertEvents = Effect.fn("RrVideo.convertEvents")(function* (
      options: Omit<ConvertOptions, "inputPath"> & { events: RrwebEvent[] },
    ) {
      const { events } = options;
      const ratio = Math.min(options.resolutionRatio ?? DEFAULT_RESOLUTION_RATIO, 1);
      const scaleFactor = ratio * MAX_SCALE_VALUE;
      if (events.length === 0) {
        return yield* new RrVideoConvertError({
          cause: "No events in session file",
        });
      }

      const maxViewport = getMaxViewport(events);
      if (maxViewport.width === 0 || maxViewport.height === 0) {
        return yield* new RrVideoConvertError({
          cause: "Could not determine viewport size from events",
        });
      }

      const scaledViewport = {
        width: Math.round(maxViewport.width * scaleFactor),
        height: Math.round(maxViewport.height * scaleFactor),
      };

      const videoDuration = events[events.length - 1].timestamp - events[0].timestamp;
      const playbackSpeed = options.speed ?? 1;
      const expectedPlaybackTime = videoDuration / playbackSpeed;
      const totalTimeout = expectedPlaybackTime + TIMEOUT_BUFFER_MS;

      const tempVideoDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "rrvideo-" }).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          new RrVideoConvertError({
            cause: `Failed to create temp dir: ${cause}`,
          }).asEffect(),
        ),
      );

      const browser = yield* acquireBrowser;

      const tempVideoPath = yield* replayToVideo(browser, {
        eventsJson: JSON.stringify(events),
        scaleFactor,
        scaledViewport,
        totalTimeout,
        tempVideoDir,
        replayConfig: {
          speed: options.speed,
          skipInactive: options.skipInactive,
        },
        rrwebAssets,
        onProgress: options.onProgress,
      });

      yield* fileSystem
        .makeDirectory(path.dirname(options.outputPath), { recursive: true })
        .pipe(Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.void));

      yield* fileSystem.copyFile(tempVideoPath, options.outputPath).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          new RrVideoConvertError({
            cause: `Failed to copy video: ${cause}`,
          }).asEffect(),
        ),
      );

      yield* Effect.logInfo("rrweb session converted to video", {
        outputPath: options.outputPath,
        videoDuration,
        playbackSpeed,
      });

      return options.outputPath;
    }, Effect.scoped);

    const convert = Effect.fn("RrVideo.convert")(function* (options: ConvertOptions) {
      yield* Effect.annotateCurrentSpan({ inputPath: options.inputPath });

      const ratio = Math.min(options.resolutionRatio ?? DEFAULT_RESOLUTION_RATIO, 1);
      const scaleFactor = ratio * MAX_SCALE_VALUE;

      const eventsJson = yield* fileSystem.readFileString(options.inputPath).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          new RrVideoConvertError({
            cause: `Failed to read input: ${cause}`,
          }).asEffect(),
        ),
      );

      const parsed = yield* Effect.try({
        try: () => JSON.parse(eventsJson) as unknown,
        catch: (cause) =>
          new RrVideoConvertError({
            cause: `Failed to parse events: ${String(cause)}`,
          }),
      });

      if (!Array.isArray(parsed)) {
        return yield* new RrVideoConvertError({
          cause: "Events file must contain a JSON array",
        });
      }

      const events: RrwebEvent[] = [];
      for (const item of parsed) {
        if (!isRrwebEvent(item)) {
          return yield* new RrVideoConvertError({
            cause: "Event missing required 'type' (number) and 'timestamp' (number) fields",
          });
        }
        events.push(item);
      }

      if (events.length === 0) {
        return yield* new RrVideoConvertError({
          cause: "No events in session file",
        });
      }

      const maxViewport = getMaxViewport(events);
      if (maxViewport.width === 0 || maxViewport.height === 0) {
        return yield* new RrVideoConvertError({
          cause: "Could not determine viewport size from events",
        });
      }

      const scaledViewport = {
        width: Math.round(maxViewport.width * scaleFactor),
        height: Math.round(maxViewport.height * scaleFactor),
      };

      const videoDuration = events[events.length - 1].timestamp - events[0].timestamp;
      const playbackSpeed = options.speed ?? 1;
      const expectedPlaybackTime = videoDuration / playbackSpeed;
      const totalTimeout = expectedPlaybackTime + TIMEOUT_BUFFER_MS;

      const tempVideoDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "rrvideo-" }).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          new RrVideoConvertError({
            cause: `Failed to create temp dir: ${cause}`,
          }).asEffect(),
        ),
      );

      const browser = yield* acquireBrowser;

      const tempVideoPath = yield* replayToVideo(browser, {
        eventsJson,
        scaleFactor,
        scaledViewport,
        totalTimeout,
        tempVideoDir,
        replayConfig: {
          speed: options.speed,
          skipInactive: options.skipInactive,
        },
        rrwebAssets,
        onProgress: options.onProgress,
      });

      yield* fileSystem
        .makeDirectory(path.dirname(options.outputPath), { recursive: true })
        .pipe(Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.void));

      yield* fileSystem.copyFile(tempVideoPath, options.outputPath).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          new RrVideoConvertError({
            cause: `Failed to copy video: ${cause}`,
          }).asEffect(),
        ),
      );

      yield* Effect.logInfo("rrweb session converted to video", {
        outputPath: options.outputPath,
        videoDuration,
        playbackSpeed,
      });

      return options.outputPath;
    }, Effect.scoped);

    return { convert, convertEvents } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
