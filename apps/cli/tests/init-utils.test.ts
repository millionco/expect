import { describe, expect, it, vi, beforeEach } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { Effect } from "effect";

vi.mock("@expect/agent", () => ({
  isCommandAvailable: vi.fn(),
  detectAvailableAgents: vi.fn().mockReturnValue([]),
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawnSync: vi.fn(),
}));

const mockedSpawnSync = vi.mocked(spawnSync);

describe("init-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hasGhCli", () => {
    it("returns true when gh is on PATH", async () => {
      const { isCommandAvailable } = await import("@expect/agent");
      vi.mocked(isCommandAvailable).mockReturnValue(true);

      const { hasGhCli } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(hasGhCli);
      expect(result).toBe(true);
    });

    it("returns false when gh is not on PATH", async () => {
      const { isCommandAvailable } = await import("@expect/agent");
      vi.mocked(isCommandAvailable).mockReturnValue(false);

      const { hasGhCli } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(hasGhCli);
      expect(result).toBe(false);
    });
  });

  describe("isGhAuthenticated", () => {
    it("returns true when gh auth status exits 0", async () => {
      mockedSpawnSync.mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

      const { isGhAuthenticated } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(isGhAuthenticated);
      expect(result).toBe(true);
    });

    it("returns false when gh auth status exits non-zero", async () => {
      mockedSpawnSync.mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);

      const { isGhAuthenticated } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(isGhAuthenticated);
      expect(result).toBe(false);
    });

    it("returns false when gh auth status throws", async () => {
      mockedSpawnSync.mockImplementation(() => {
        throw new Error("command not found");
      });

      const { isGhAuthenticated } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(isGhAuthenticated);
      expect(result).toBe(false);
    });
  });

  describe("setGhSecret", () => {
    it("succeeds when gh secret set exits 0", async () => {
      mockedSpawnSync.mockReturnValue({
        status: 0,
        stderr: Buffer.from(""),
      } as unknown as ReturnType<typeof spawnSync>);

      const { setGhSecret } = await import("../src/commands/init-utils");
      await Effect.runPromise(setGhSecret("MY_SECRET", "my-value"));

      expect(mockedSpawnSync).toHaveBeenCalledWith(
        "gh",
        ["secret", "set", "MY_SECRET"],
        expect.objectContaining({ input: "my-value" }),
      );
    });

    it("fails with GhSecretSetError when exit code is non-zero", async () => {
      mockedSpawnSync.mockReturnValue({
        status: 1,
        stderr: Buffer.from("not logged in"),
      } as unknown as ReturnType<typeof spawnSync>);

      const { setGhSecret } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(
        setGhSecret("MY_SECRET", "my-value").pipe(
          Effect.as("ok" as const),
          Effect.catchTag("GhSecretSetError", (error) =>
            Effect.succeed({ failed: true, reason: error.reason }),
          ),
        ),
      );

      expect(result).toEqual({ failed: true, reason: "not logged in" });
    });

    it("includes exit code in reason when stderr is empty", async () => {
      mockedSpawnSync.mockReturnValue({
        status: 2,
        stderr: Buffer.from(""),
      } as unknown as ReturnType<typeof spawnSync>);

      const { setGhSecret } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(
        setGhSecret("MY_SECRET", "val").pipe(
          Effect.as("ok" as const),
          Effect.catchTag("GhSecretSetError", (error) =>
            Effect.succeed({ failed: true, reason: error.reason }),
          ),
        ),
      );

      expect(result).toEqual({
        failed: true,
        reason: "gh secret set exited with code 2",
      });
    });
  });

  describe("setGhVariable", () => {
    it("succeeds when gh variable set exits 0", async () => {
      mockedSpawnSync.mockReturnValue({
        status: 0,
        stderr: Buffer.from(""),
      } as unknown as ReturnType<typeof spawnSync>);

      const { setGhVariable } = await import("../src/commands/init-utils");
      await Effect.runPromise(setGhVariable("EXPECT_BASE_URL", "http://localhost:3000"));

      expect(mockedSpawnSync).toHaveBeenCalledWith(
        "gh",
        ["variable", "set", "EXPECT_BASE_URL", "--body", "http://localhost:3000"],
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
      );
    });

    it("fails with GhVariableSetError when exit code is non-zero", async () => {
      mockedSpawnSync.mockReturnValue({
        status: 1,
        stderr: Buffer.from("not authorized"),
      } as unknown as ReturnType<typeof spawnSync>);

      const { setGhVariable } = await import("../src/commands/init-utils");
      const result = await Effect.runPromise(
        setGhVariable("EXPECT_BASE_URL", "http://localhost:3000").pipe(
          Effect.as("ok" as const),
          Effect.catchTag("GhVariableSetError", (error) =>
            Effect.succeed({ failed: true, reason: error.reason }),
          ),
        ),
      );

      expect(result).toEqual({ failed: true, reason: "not authorized" });
    });
  });
});
