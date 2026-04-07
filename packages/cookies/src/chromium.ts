import * as path from "node:path";
import * as os from "node:os";
import { Array as Arr, Effect, Layer, Option, Predicate, Schema, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ChromiumBrowser, type ChromiumBrowserKey } from "./types";
import { CHROMIUM_CONFIGS, type ChromiumConfig } from "./browser-config";
import { ListBrowsersError } from "./errors";
import { Browsers } from "./browser-detector";

const CONCURRENCY_PROFILE_SCAN = 10;

const LocalStateSchema = Schema.Struct({
  profile: Schema.optional(
    Schema.Struct({
      last_used: Schema.optional(Schema.String),
    }),
  ),
});

const PreferencesSchema = Schema.Struct({
  intl: Schema.optional(
    Schema.Struct({
      selected_languages: Schema.optional(Schema.String),
      accept_languages: Schema.optional(Schema.String),
    }),
  ),
});

export class ChromiumPlatform extends ServiceMap.Service<
  ChromiumPlatform,
  {
    executableCandidates: (config: ChromiumConfig) => readonly string[];
    userDataDir: (config: ChromiumConfig) => string;
  }
>()("@cookies/ChromiumPlatform") {
  static layerDarwin = Layer.succeed(this, {
    executableCandidates: (config: ChromiumConfig) => [config.executable.darwin],
    userDataDir: (config: ChromiumConfig) =>
      path.join(os.homedir(), "Library", "Application Support", config.userData.darwin),
  });

  static layerLinux = Layer.succeed(this, {
    executableCandidates: (config: ChromiumConfig) => config.executable.linux,
    userDataDir: (config: ChromiumConfig) =>
      path.join(
        process.env["XDG_CONFIG_HOME"] ?? path.join(os.homedir(), ".config"),
        config.userData.linux,
      ),
  });

  static layerWin32 = Layer.effect(this)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const registryPaths = new Map<string, string>();

      for (const config of CHROMIUM_CONFIGS) {
        const regPath = `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${config.registryKey}`;
        const output = yield* spawner
          .string(ChildProcess.make("reg", ["query", regPath, "/ve"]))
          .pipe(
            Effect.map((result) => result.trim()),
            Effect.catch(() => Effect.succeed("")),
          );
        if (output) {
          const match = output.match(/REG_SZ\s+(.+)/);
          const registryExePath = match?.[1]?.trim();
          if (registryExePath) registryPaths.set(config.key, registryExePath);
        }
      }

      const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
      const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
      const localAppData =
        process.env["LOCALAPPDATA"] ?? path.join(os.homedir(), "AppData", "Local");

      return {
        executableCandidates: (config: ChromiumConfig) => {
          const candidates: string[] = [];
          const regPath = registryPaths.get(config.key);
          if (regPath) candidates.push(regPath);
          for (const relative of config.executable.win32) {
            candidates.push(
              path.join(programFiles, relative),
              path.join(programFilesX86, relative),
              path.join(localAppData, relative),
            );
          }
          return candidates;
        },
        userDataDir: (config: ChromiumConfig) => path.join(localAppData, config.userData.win32),
      };
    }),
  ).pipe(Layer.provide(NodeServices.layer));
}

export class ChromiumSource extends ServiceMap.Service<ChromiumSource>()(
  "@cookies/ChromiumSource",
  {
    make: Effect.gen(function* () {
      const browsers = yield* Browsers;
      const config = yield* ChromiumPlatform;
      const fs = yield* FileSystem.FileSystem;

      const getLastUsedProfile = (userDataDir: string) =>
        fs.readFileString(path.join(userDataDir, "Local State")).pipe(
          Effect.flatMap((content) =>
            Schema.decodeEffect(Schema.fromJsonString(LocalStateSchema))(content),
          ),
          Effect.map((localState) => Option.fromNullishOr(localState.profile?.last_used)),
          Effect.catchReason("PlatformError", "NotFound", () =>
            Effect.succeed(Option.none<string>()),
          ),
        );

      const loadProfileLocale = (profilePath: string) =>
        fs.readFileString(path.join(profilePath, "Preferences")).pipe(
          Effect.flatMap((content) =>
            Schema.decodeEffect(Schema.fromJsonString(PreferencesSchema))(content),
          ),
          Effect.map((preferences) => {
            const languages =
              preferences.intl?.selected_languages ?? preferences.intl?.accept_languages;
            if (!languages) return undefined;
            return languages
              .split(",")
              .map((language) => language.trim())
              .find((language) => language.length > 0);
          }),
          Effect.catch(() => Effect.succeed(undefined)),
        );

      const detectProfiles = (
        key: ChromiumBrowserKey,
        executablePath: string,
        userDataDir: string,
      ) =>
        Effect.gen(function* () {
          if (!(yield* fs.exists(userDataDir))) return [];

          const lastUsedProfileName = yield* getLastUsedProfile(userDataDir);
          const entries = yield* fs
            .readDirectory(userDataDir)
            .pipe(
              Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed([] as string[])),
            );

          const hasPreferences = (profileEntryPath: string) =>
            fs
              .exists(path.join(profileEntryPath, "Preferences"))
              .pipe(
                Effect.catchReason("PlatformError", "BadResource", () => Effect.succeed(false)),
              );

          return yield* Effect.forEach(
            entries,
            (entry) =>
              Effect.gen(function* () {
                const profileEntryPath = path.join(userDataDir, entry);
                if (!(yield* hasPreferences(profileEntryPath))) return undefined;

                const locale = yield* loadProfileLocale(profileEntryPath);

                return new ChromiumBrowser({
                  key,
                  profileName: entry,
                  profilePath: profileEntryPath,
                  executablePath,
                  ...(locale ? { locale } : {}),
                });
              }),
            { concurrency: CONCURRENCY_PROFILE_SCAN },
          ).pipe(
            Effect.map(Arr.filter(Predicate.isNotUndefined)),
            Effect.map(
              Arr.sort(ChromiumBrowser.orderBy(Option.getOrUndefined(lastUsedProfileName))),
            ),
          );
        });

      yield* browsers.register(
        Effect.forEach(
          CHROMIUM_CONFIGS,
          (chromiumConfig) =>
            Effect.gen(function* () {
              let executablePath: string | undefined;
              for (const candidate of config.executableCandidates(chromiumConfig)) {
                if (yield* fs.exists(candidate)) {
                  executablePath = candidate;
                  break;
                }
              }
              if (!executablePath) return [];

              return yield* detectProfiles(
                chromiumConfig.key,
                executablePath,
                config.userDataDir(chromiumConfig),
              );
            }),
          { concurrency: "unbounded" },
        ).pipe(
          Effect.map(Arr.flatten),
          Effect.catch((cause) => new ListBrowsersError({ cause: String(cause) }).asEffect()),
        ),
      );
    }),
  },
) {
  static layer = Layer.effectDiscard(this.make).pipe(Layer.provide(NodeServices.layer));
}
