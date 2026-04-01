import { describe, expect, it, vi, beforeEach } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { Effect, Layer, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

vi.mock("@expect/shared/is-command-available", () => ({
  isCommandAvailable: vi.fn(),
}));

vi.mock("@expect/agent", () => ({
  detectAvailableAgents: vi.fn().mockReturnValue([]),
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawnSync: vi.fn(),
}));

const mockedSpawnSync = vi.mocked(spawnSync);

const makeTestHandle = (options: {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}): ChildProcessSpawner.ChildProcessHandle =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1234),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(options.exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: { run: () => Effect.void } as never,
    stdout: options.stdout ? Stream.make(new TextEncoder().encode(options.stdout)) : Stream.empty,
    stderr: options.stderr ? Stream.make(new TextEncoder().encode(options.stderr)) : Stream.empty,
    all: Stream.empty,
    getInputFd: () => ({ run: () => Effect.void }) as never,
    getOutputFd: () => Stream.empty,
  });

const makeSpawnerLayer = (spawnFn: ChildProcessSpawner.ChildProcessSpawner["Service"]["spawn"]) =>
  Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, ChildProcessSpawner.make(spawnFn));

describe("init-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hasGhCli", () => {
    it("returns true when gh is on PATH", async () => {
      const { isCommandAvailable } = await import("@expect/shared/is-command-available");
      vi.mocked(isCommandAvailable).mockReturnValue(true);

      const { hasGhCli } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(hasGhCli);
      expect(result).toBe(true);
    });

    it("returns false when gh is not on PATH", async () => {
      const { isCommandAvailable } = await import("@expect/shared/is-command-available");
      vi.mocked(isCommandAvailable).mockReturnValue(false);

      const { hasGhCli } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(hasGhCli);
      expect(result).toBe(false);
    });
  });

  describe("isGithubCliAuthenticated", () => {
    it("returns true when gh auth status exits 0", async () => {
      mockedSpawnSync.mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

      const { isGithubCliAuthenticated } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(isGithubCliAuthenticated);
      expect(result).toBe(true);
    });

    it("returns false when gh auth status exits non-zero", async () => {
      mockedSpawnSync.mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);

      const { isGithubCliAuthenticated } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(isGithubCliAuthenticated);
      expect(result).toBe(false);
    });

    it("returns false when gh auth status throws", async () => {
      mockedSpawnSync.mockImplementation(() => {
        throw new Error("command not found");
      });

      const { isGithubCliAuthenticated } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(isGithubCliAuthenticated);
      expect(result).toBe(false);
    });
  });

  describe("setGhSecret", () => {
    it("succeeds when gh secret set exits 0", async () => {
      const layer = makeSpawnerLayer(() => Effect.succeed(makeTestHandle({ exitCode: 0 })));

      const { setGhSecret } = await import("../src/commands/init-utils");
      await Effect.runPromise(setGhSecret("MY_SECRET", "my-value").pipe(Effect.provide(layer)));
    });

    it("fails with GhSecretSetError when exit code is non-zero", async () => {
      const layer = makeSpawnerLayer(() =>
        Effect.succeed(makeTestHandle({ exitCode: 1, stderr: "not logged in" })),
      );

      const { setGhSecret } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(
        setGhSecret("MY_SECRET", "my-value").pipe(
          Effect.as("ok" as const),
          Effect.catchTag("GhSecretSetError", (error) =>
            Effect.succeed({ failed: true, reason: error.reason }),
          ),
          Effect.provide(layer),
        ),
      );

      expect(result).toEqual({ failed: true, reason: "not logged in" });
    });

    it("includes exit code in reason when stderr is empty", async () => {
      const layer = makeSpawnerLayer(() =>
        Effect.succeed(makeTestHandle({ exitCode: 2, stderr: "" })),
      );

      const { setGhSecret } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(
        setGhSecret("MY_SECRET", "val").pipe(
          Effect.as("ok" as const),
          Effect.catchTag("GhSecretSetError", (error) =>
            Effect.succeed({ failed: true, reason: error.reason }),
          ),
          Effect.provide(layer),
        ),
      );

      expect(result).toEqual({
        failed: true,
        reason: "gh secret set exited with code 2",
      });
    });
  });
});
