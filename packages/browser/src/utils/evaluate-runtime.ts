import type { Page } from "playwright";
import { Effect } from "effect";
import type { ExpectRuntime } from "../runtime/runtime-types";

// HACK: page.evaluate erases types across the serialization boundary; casts are confined here
export const evaluateRuntime = <K extends keyof ExpectRuntime>(
  page: Page,
  method: K,
  ...args: Parameters<ExpectRuntime[K]>
) =>
  Effect.promise(
    () =>
      page.evaluate<ReturnType<ExpectRuntime[K]>, { method: string; args: unknown[] }>(
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
      ),
  );
