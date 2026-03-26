import { Effect, Schema } from "effect";

export const HEADLESS_RUN_TIMEOUT_MS = 15 * 60_000;

const formatHeadlessRunTimeout = (durationMs: number) => {
  if (durationMs % 60_000 === 0) {
    const minutes = durationMs / 60_000;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${durationMs}ms`;
};

export class HeadlessRunTimeoutError extends Schema.ErrorClass<HeadlessRunTimeoutError>(
  "HeadlessRunTimeoutError",
)({
  _tag: Schema.tag("HeadlessRunTimeoutError"),
  durationMs: Schema.Number,
}) {
  message = `Headless browser test timed out after ${formatHeadlessRunTimeout(this.durationMs)}.`;
}

export const withHeadlessRunTimeout = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  durationMs = HEADLESS_RUN_TIMEOUT_MS,
) =>
  effect.pipe(
    Effect.timeoutOrElse({
      duration: durationMs,
      onTimeout: () => new HeadlessRunTimeoutError({ durationMs }).asEffect(),
    }),
  );
