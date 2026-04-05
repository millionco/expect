import type { Page } from "playwright";
import { Effect } from "effect";
import type { ExpectRuntime } from "../generated/runtime-types";
import { BrowserLaunchError } from "../errors";

// HACK: page.evaluate erases types across the serialization boundary; casts are confined here
export const evaluateRuntime = <K extends keyof ExpectRuntime>(
  page: Page,
  method: K,
  ...args: Parameters<ExpectRuntime[K]>
) =>
  Effect.tryPromise({
    try: () =>
      page.evaluate(
        ({ method, args }: { method: string; args: unknown[] }) => {
          const runtime = Reflect.get(globalThis, "__EXPECT_RUNTIME__");
          if (!runtime || typeof runtime !== "object") {
            throw new Error("Browser runtime is not initialized");
          }

          const fn = Reflect.get(runtime, method);
          if (typeof fn !== "function") {
            throw new Error(`Browser runtime method not found: ${method}`);
          }

          return fn(...args);
        },
        { method, args: args as unknown[] },
      ) as Promise<ReturnType<ExpectRuntime[K]>>,
    catch: (cause) => new BrowserLaunchError({ cause }),
  });
