import { Effect, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as os from "node:os";
import * as path from "node:path";

const CONFIG_DIRECTORY = path.join(os.homedir(), ".config", "browser-tester");
const PREFERENCES_FILE_PATH = path.join(CONFIG_DIRECTORY, "preferences.json");

const PreferencesFileSchema = Schema.Struct({
  skipPlanning: Schema.optional(Schema.Boolean),
});

export interface PersistedPreferences {
  skipPlanning: boolean;
}

const DEFAULT_PREFERENCES: PersistedPreferences = {
  skipPlanning: true,
};

class PreferencesReadError extends Schema.ErrorClass<PreferencesReadError>("PreferencesReadError")({
  _tag: Schema.tag("PreferencesReadError"),
}) {
  message = "Failed to read preferences file";
}

export class PreferencesWriteError extends Schema.ErrorClass<PreferencesWriteError>(
  "PreferencesWriteError",
)({
  _tag: Schema.tag("PreferencesWriteError"),
}) {
  message = "Failed to write preferences file";
}

export const loadPreferences = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const content = yield* fs
    .readFileString(PREFERENCES_FILE_PATH)
    .pipe(Effect.catchTag("PlatformError", () => new PreferencesReadError().asEffect()));

  const parsed = yield* Schema.decodeEffect(Schema.fromJsonString(PreferencesFileSchema))(content);

  return {
    skipPlanning: parsed.skipPlanning ?? DEFAULT_PREFERENCES.skipPlanning,
  };
}).pipe(
  Effect.catchTag("PreferencesReadError", () => Effect.succeed(DEFAULT_PREFERENCES)),
  Effect.catchTag("SchemaError", () => Effect.succeed(DEFAULT_PREFERENCES)),
);

export const savePreferences = Effect.fn("savePreferences")(function* (
  preferences: Partial<PersistedPreferences>,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const current = yield* loadPreferences;
  const merged: PersistedPreferences = { ...current, ...preferences };
  yield* fileSystem
    .makeDirectory(CONFIG_DIRECTORY, { recursive: true })
    .pipe(Effect.catchTag("PlatformError", () => new PreferencesWriteError().asEffect()));
  yield* fileSystem
    .writeFileString(PREFERENCES_FILE_PATH, JSON.stringify(merged, undefined, 2) + "\n")
    .pipe(Effect.catchTag("PlatformError", () => new PreferencesWriteError().asEffect()));
});
