import { describe, expect, it } from "vite-plus/test";
import { Effect } from "effect";
import { withHeadlessRunTimeout } from "../src/utils/headless-run-timeout";

describe("withHeadlessRunTimeout", () => {
  it("preserves successful effects", async () => {
    const result = await Effect.runPromise(withHeadlessRunTimeout(Effect.succeed("ok"), 10));

    expect(result).toBe("ok");
  });

  it("fails hung effects with HeadlessRunTimeoutError", async () => {
    const error = await Effect.runPromise(
      withHeadlessRunTimeout(Effect.never, 10).pipe(Effect.flip),
    );

    expect(error._tag).toBe("HeadlessRunTimeoutError");
    expect(error.durationMs).toBe(10);
  });
});
