import * as path from "node:path";
import { Effect, Layer, Scope, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { CookieDatabaseCopyError, CookieReadError } from "./errors";

const IS_BUN = "Bun" in globalThis;
const BUN_SQLITE_MODULE = "bun:sqlite";
const NODE_SQLITE_MODULE = "node:sqlite";

interface SqliteDatabase {
  prepare(sql: string): { all(): Record<string, unknown>[] };
  close(): void;
}

export class SqliteEngine extends ServiceMap.Service<
  SqliteEngine,
  {
    readonly open: (
      databasePath: string,
    ) => Effect.Effect<SqliteDatabase, CookieReadError, Scope.Scope>;
  }
>()("@cookies/SqliteEngine") {
  static layerBun = Layer.succeed(this, {
    open: (databasePath: string) =>
      Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const { Database } = await import(BUN_SQLITE_MODULE);
            return new Database(databasePath, {
              readonly: true,
            }) as SqliteDatabase;
          },
          catch: (cause) => new CookieReadError({ browser: "unknown", cause: String(cause) }),
        }),
        (database) => Effect.sync(() => database.close()),
      ),
  });

  static layerNodeJs = Layer.succeed(this, {
    open: (databasePath: string) =>
      Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const { DatabaseSync } = await import(NODE_SQLITE_MODULE);
            return new DatabaseSync(databasePath, {
              readOnly: true,
              readBigInts: true,
            }) as unknown as SqliteDatabase;
          },
          catch: (cause) => new CookieReadError({ browser: "unknown", cause: String(cause) }),
        }),
        (database) => Effect.sync(() => database.close()),
      ),
  });

  static layerLibSql = Layer.succeed(this, {
    open: (databasePath: string) =>
      Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const { default: LibsqlDatabase } = await import("libsql");
            return new LibsqlDatabase(databasePath, {
              readonly: true,
            }) as unknown as SqliteDatabase;
          },
          catch: (cause) => new CookieReadError({ browser: "unknown", cause: String(cause) }),
        }),
        (database) => Effect.sync(() => database.close()),
      ),
  });
}

export class SqliteClient extends ServiceMap.Service<SqliteClient>()("@cookies/SqliteClient", {
  make: Effect.gen(function* () {
    const engine = yield* SqliteEngine;
    const fileSystem = yield* FileSystem.FileSystem;

    const query = Effect.fn("SqliteClient.query")(function* (
      databasePath: string,
      sqlQuery: string,
      browser: string,
    ) {
      yield* Effect.annotateCurrentSpan({ browser, databasePath });
      const database = yield* engine
        .open(databasePath)
        .pipe(
          Effect.catchTag("CookieReadError", (error) =>
            new CookieReadError({ browser, cause: error.cause }).asEffect(),
          ),
        );
      return yield* Effect.try({
        try: () => database.prepare(sqlQuery).all(),
        catch: (cause) => new CookieReadError({ browser, cause: String(cause) }),
      });
    }, Effect.scoped);

    const copyToTemp = Effect.fn("SqliteClient.copyToTemp")(function* (
      databasePath: string,
      prefix: string,
      filename: string,
      browser: string,
    ) {
      const tempDir = yield* fileSystem.makeTempDirectory({ prefix });
      yield* Effect.addFinalizer(() =>
        fileSystem.remove(tempDir, { recursive: true }).pipe(Effect.catch(() => Effect.void)),
      );

      const tempDatabasePath = path.join(tempDir, filename);
      yield* fileSystem.copyFile(databasePath, tempDatabasePath).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          new CookieDatabaseCopyError({
            browser,
            databasePath,
            cause: String(cause),
          }).asEffect(),
        ),
      );
      yield* fileSystem
        .copyFile(`${databasePath}-wal`, `${tempDatabasePath}-wal`)
        .pipe(Effect.catch(() => Effect.void));
      yield* fileSystem
        .copyFile(`${databasePath}-shm`, `${tempDatabasePath}-shm`)
        .pipe(Effect.catch(() => Effect.void));

      return { tempDir, tempDatabasePath };
    });

    return { query, copyToTemp } as const;
  }),
}) {
  static layerBun = Layer.effect(this, this.make).pipe(
    Layer.provide(SqliteEngine.layerBun),
    Layer.provide(NodeServices.layer),
  );

  static layerNodeJs = Layer.effect(this, this.make).pipe(
    Layer.provide(SqliteEngine.layerNodeJs),
    Layer.provide(NodeServices.layer),
  );

  static layer = IS_BUN ? this.layerBun : this.layerNodeJs;
}
