import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { eventWithTime } from "@rrweb/types";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { ViewerSourceNotFoundError } from "./errors";
import { ViewerRunState } from "./viewer-events";

export interface BuildViewerHtmlOptions {
  readonly events: readonly eventWithTime[];
  readonly stepState?: ViewerRunState;
}

const resolveViewerRoot = Effect.fn("ViewerServer.resolveViewerRoot")(function* () {
  const fileSystem = yield* FileSystem;
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const devPath = join(thisDir, "..", "viewer");

  if (yield* fileSystem.exists(join(devPath, "index.html"))) {
    return devPath;
  }

  const packagePath = yield* Effect.try({
    try: () => {
      const req = createRequire(import.meta.url);
      return join(dirname(req.resolve("@browser-tester/videogen/package.json")), "viewer");
    },
    catch: () => ({ _tag: "PackageResolveError" as const }),
  }).pipe(Effect.catchTag("PackageResolveError", () => Effect.succeed(undefined)));

  if (packagePath && (yield* fileSystem.exists(join(packagePath, "index.html")))) {
    return packagePath;
  }

  return yield* new ViewerSourceNotFoundError();
});

const buildToTmpDir = Effect.fn("ViewerServer.buildToTmpDir")(function* (viewerRoot: string) {
  const fileSystem = yield* FileSystem;
  const tmpDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "videogen-viewer-" });

  yield* Effect.logInfo("Building viewer...");
  const vite = yield* Effect.tryPromise(() => import("vite")).pipe(
    Effect.catchTag("UnknownError", Effect.die),
  );
  yield* Effect.tryPromise(() =>
    vite.build({ root: viewerRoot, logLevel: "warn", build: { outDir: tmpDir, emptyOutDir: true } }),
  ).pipe(Effect.catchTag("UnknownError", Effect.die));

  return tmpDir;
});

export const buildViewerHtml = Effect.fn("buildViewerHtml")(function* (
  options: BuildViewerHtmlOptions,
) {
  const fileSystem = yield* FileSystem;
  const viewerRoot = yield* resolveViewerRoot();

  let html = yield* Effect.scoped(
    Effect.gen(function* () {
      const distDir = yield* buildToTmpDir(viewerRoot);
      return yield* fileSystem.readFileString(join(distDir, "index.html"));
    }),
  );

  const data = JSON.stringify({
    events: options.events,
    stepState:
      options.stepState ??
      new ViewerRunState({ title: "", status: "running", steps: [], summary: undefined }),
  }).replace(/</g, "\\u003c");

  html = html.replace("</head>", `<script>window.__VIEWER_DATA__=${data};</script>\n</head>`);

  return html;
});
