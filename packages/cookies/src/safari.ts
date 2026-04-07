import * as path from "node:path";
import * as os from "node:os";
import { Effect, Layer, Option, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import { SafariBrowser } from "./types";
import { SAFARI_CONFIG } from "./browser-config";
import { ListBrowsersError } from "./errors";
import { Browsers } from "./browser-detector";

export class SafariPlatform extends ServiceMap.Service<
  SafariPlatform,
  { executable: string; cookieRelativePaths: readonly string[] }
>()("@cookies/SafariPlatform") {
  static layerDarwin = Layer.succeed(this, {
    executable: SAFARI_CONFIG.executable,
    cookieRelativePaths: SAFARI_CONFIG.cookieRelativePaths,
  });
}

export class SafariSource extends ServiceMap.Service<SafariSource>()("@cookies/SafariSource", {
  make: Effect.gen(function* () {
    const browsers = yield* Browsers;
    const config = yield* SafariPlatform;
    const fileSystem = yield* FileSystem.FileSystem;

    yield* browsers.register(
      Effect.gen(function* () {
        if (!(yield* fileSystem.exists(config.executable))) return [];

        let cookieFilePath = Option.none<string>();
        for (const relativePath of config.cookieRelativePaths) {
          const candidate = path.join(os.homedir(), relativePath, "Cookies.binarycookies");
          if (yield* fileSystem.exists(candidate)) {
            cookieFilePath = Option.some(candidate);
            break;
          }
        }

        return [new SafariBrowser({ cookieFilePath })];
      }).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          new ListBrowsersError({ cause: String(cause) }).asEffect(),
        ),
      ),
    );
  }),
}) {
  static layer = Layer.effectDiscard(this.make);
}
