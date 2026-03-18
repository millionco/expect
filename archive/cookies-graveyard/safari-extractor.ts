/**
 * @deprecated ARCHIVED / DEAD CODE
 * Do not import, pattern-match on, or reference this code in new work.
 * Kept only as reference for browser SQLite decryption and cookie extraction logic.
 */

import { homedir, platform } from "node:os";
import path from "node:path";
import { Effect, Layer, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import { NodeServices } from "@effect/platform-node";
import { getEpochSeconds } from "@browser-tester/utils";
import { parseBinaryCookies } from "./utils/binary-cookies";
import { SAFARI_CONFIG } from "./browser-config";
import { CookieDatabaseNotFoundError, BinaryParseError } from "./errors";
import { hostMatchesAny } from "./utils/host-matching";
import type { Cookie } from "./types";

const resolveBinaryCookiesPath = Effect.fn("SafariExtractor.resolveBinaryCookiesPath")(
  function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const home = homedir();

    for (const relativePath of SAFARI_CONFIG.cookieRelativePaths) {
      const candidate = path.join(home, relativePath, "Cookies.binarycookies");
      if (yield* fileSystem.exists(candidate)) return candidate;
    }
    return yield* new CookieDatabaseNotFoundError({ browser: "safari" }).asEffect();
  },
);

export class SafariExtractor extends ServiceMap.Service<SafariExtractor>()(
  "@cookies/SafariExtractor",
  {
    make: Effect.gen(function* () {
      const extract = Effect.fn("SafariExtractor.extract")(function* (
        hosts: string[],
        options: {
          names?: string[];
          includeExpired?: boolean;
        } = {},
      ) {
        yield* Effect.annotateCurrentSpan({ browser: "safari" });

        if (platform() !== "darwin") return [];

        const fileSystem = yield* FileSystem.FileSystem;
        const cookieFile = yield* resolveBinaryCookiesPath();
        const now = getEpochSeconds();
        const allowlist = options.names ? new Set(options.names) : undefined;

        const data = yield* fileSystem
          .readFile(cookieFile)
          .pipe(
            Effect.catchTag("PlatformError", (cause) =>
              new BinaryParseError({ filePath: cookieFile, cause: String(cause) }).asEffect(),
            ),
          );

        const parsed = parseBinaryCookies(Buffer.from(data));
        const cookies: Cookie[] = [];

        for (const cookie of parsed) {
          if (!cookie.name || !cookie.domain) continue;
          if (allowlist && !allowlist.has(cookie.name)) continue;
          if (!hostMatchesAny(hosts, cookie.domain)) continue;
          if (!options.includeExpired && cookie.expires && cookie.expires < now) continue;
          cookies.push(cookie);
        }

        yield* Effect.logInfo("Safari cookies extracted", { count: cookies.length });
        return cookies;
      });

      return { extract } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
