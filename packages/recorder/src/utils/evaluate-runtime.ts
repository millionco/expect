import type { Page } from "playwright";
import { Effect } from "effect";
import type { RecorderRuntime } from "../generated/runtime-types";

// HACK: page.evaluate erases types across the serialization boundary; casts are confined here
export const evaluateRecorderRuntime = <K extends keyof RecorderRuntime>(
  page: Page,
  method: K,
  ...args: Parameters<RecorderRuntime[K]>
) =>
  Effect.promise(
    () =>
      page.evaluate(
        ({ method, args }: { method: string; args: unknown[] }) => {
          const runtime = Reflect.get(globalThis, "__browserTesterRuntime");
          if (!runtime || typeof runtime !== "object") {
            throw new Error("Browser runtime is not initialized");
          }

          const fn = Reflect.get(runtime, method);
          if (typeof fn !== "function") {
            throw new Error(`Recorder runtime method not found: ${method}`);
          }

          return fn(...args);
        },
        { method, args: args as unknown[] },
      ) as Promise<ReturnType<RecorderRuntime[K]>>,
  );
