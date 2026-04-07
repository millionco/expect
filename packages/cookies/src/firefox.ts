import * as path from "node:path";
import * as os from "node:os";
import { parse } from "ini";
import { Effect, Layer, Predicate, Schema, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import { FirefoxBrowser } from "./types";
import { FIREFOX_CONFIG } from "./browser-config";
import { ListBrowsersError } from "./errors";
import { Browsers } from "./browser-detector";

const ProfileSection = Schema.Struct({
  Name: Schema.String,
  Path: Schema.String,
  IsRelative: Schema.optional(Schema.String),
});

const parseProfilesIni = (content: string) =>
  Object.values(parse(content))
    .map((section) => Schema.decodeUnknownOption(ProfileSection)(section))
    .filter((option) => option._tag === "Some")
    .map((option) => ({
      name: option.value.Name,
      path: option.value.Path,
      isRelative: option.value.IsRelative !== "0",
    }));

export class FirefoxPlatform extends ServiceMap.Service<
  FirefoxPlatform,
  { dataDir: string; executablePaths: readonly string[] }
>()("@cookies/FirefoxPlatform") {
  static layerDarwin = Layer.succeed(this, {
    dataDir: path.join(os.homedir(), FIREFOX_CONFIG.dataDir.darwin),
    executablePaths: [FIREFOX_CONFIG.executable.darwin],
  });

  static layerLinux = Layer.succeed(this, {
    dataDir: path.join(os.homedir(), FIREFOX_CONFIG.dataDir.linux),
    executablePaths: FIREFOX_CONFIG.executable.linux,
  });

  static layerWin32 = Layer.succeed(this, {
    dataDir: path.join(os.homedir(), FIREFOX_CONFIG.dataDir.win32),
    executablePaths: FIREFOX_CONFIG.executable.win32.flatMap((relative) => {
      const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
      const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
      return [path.join(programFiles, relative), path.join(programFilesX86, relative)];
    }),
  });
}

export class FirefoxSource extends ServiceMap.Service<FirefoxSource>()("@cookies/FirefoxSource", {
  make: Effect.gen(function* () {
    const browsers = yield* Browsers;
    const config = yield* FirefoxPlatform;
    const fileSystem = yield* FileSystem.FileSystem;

    yield* browsers.register(
      Effect.gen(function* () {
        let executablePath: string | undefined;
        for (const candidate of config.executablePaths) {
          if (yield* fileSystem.exists(candidate)) {
            executablePath = candidate;
            break;
          }
        }
        if (!executablePath) return [];

        const iniPath = path.join(config.dataDir, "profiles.ini");
        const iniContent = yield* fileSystem.readFileString(iniPath);

        const parsedProfiles = parseProfilesIni(iniContent);

        return yield* Effect.forEach(
          parsedProfiles,
          (parsed) =>
            Effect.gen(function* () {
              const profileEntryPath = parsed.isRelative
                ? path.join(config.dataDir, parsed.path)
                : parsed.path;
              const cookiesPath = path.join(profileEntryPath, "cookies.sqlite");
              if (!(yield* fileSystem.exists(cookiesPath))) return undefined;

              return new FirefoxBrowser({
                profileName: path.basename(profileEntryPath),
                profilePath: profileEntryPath,
              });
            }),
          { concurrency: "unbounded" },
        ).pipe(Effect.map((results) => results.filter(Predicate.isNotUndefined)));
      }).pipe(Effect.catch((cause) => new ListBrowsersError({ cause: String(cause) }).asEffect())),
    );
  }),
}) {
  static layer = Layer.effectDiscard(this.make);
}
