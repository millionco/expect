---
name: effect-portable-patterns
description: Portable Effect patterns for robust promise execution. Use when wrapping async operations with timeouts, retries, tagged errors, caching, concurrency, pattern matching, or tracing - all designed to resolve to a plain Promise via Effect.runPromise.
version: 1.0.0
---

# Effect as a Portable Promise Utility

Use Effect as a lightweight utility for running promises robustly. Every effect is self-contained (no services, no layers, no dependency injection) and resolves to a plain `Promise` at the boundary via `Effect.runPromise`.

The shape is always: `Effect.fn` or `Effect.gen` -> pipe operators -> `Effect.runPromise`.

## Quick Reference

| Capability       | API                                              | Avoid                                   |
| ---------------- | ------------------------------------------------ | --------------------------------------- |
| Wrap promises    | `Effect.tryPromise`                              | `Effect.promise` (swallows errors)      |
| Define functions | `Effect.fn("name")`                              | Anonymous generators                    |
| Errors           | `Data.TaggedError` with `_tag`                   | Plain `Error` or untagged objects       |
| Catch by tag     | `catchTag` / `catchTags`                         | `catchAll` (loses type narrowing)       |
| Fallbacks        | `orElse`, `orElseSucceed`                        | Nested try/catch                        |
| Timeouts         | `Effect.timeout` / `Effect.timeoutFail`          | Manual `AbortController` + `setTimeout` |
| Retries          | `Effect.retry` with `Schedule`                   | Manual retry loops                      |
| Caching          | `Effect.cachedWithTTL` / `Effect.cachedFunction` | Manual Map-based caches                 |
| Concurrency      | `Effect.all` with `{ concurrency: N }`           | Manual `Promise.all` chunking           |
| Pattern matching | `Match.value` / `Match.type` with `Match.tag`    | Switch statements on `_tag`             |
| Tracing          | `Effect.withSpan` / `Effect.annotateCurrentSpan` | Manual console.time                     |
| Run at boundary  | `Effect.runPromise`                              | `Effect.runSync` for async work         |

## Core Pattern: Portable Effect Functions

Every effect function follows this structure - build an `Effect<Success, Error, never>` (no requirements), then run it as a promise at the call site.

```typescript
import { Effect, Data } from "effect";

class FetchError extends Data.TaggedError("FetchError")<{
  url: string;
  status: number;
  message: string;
}> {}

const fetchUser = Effect.fn("fetchUser")(function* (userId: string) {
  const response = yield* Effect.tryPromise({
    try: () => fetch(`/api/users/${userId}`),
    catch: () =>
      new FetchError({
        url: `/api/users/${userId}`,
        status: 0,
        message: "Network error",
      }),
  });

  if (!response.ok) {
    return yield* Effect.fail(
      new FetchError({
        url: `/api/users/${userId}`,
        status: response.status,
        message: response.statusText,
      }),
    );
  }

  const user = yield* Effect.tryPromise({
    try: () => response.json() as Promise<User>,
    catch: () =>
      new FetchError({
        url: `/api/users/${userId}`,
        status: response.status,
        message: "Invalid JSON",
      }),
  });

  return user;
});

// At the call site - always resolves to a plain Promise
const user: User = await Effect.runPromise(fetchUser("123"));
```

## Tagged Errors

Define errors with `Data.TaggedError`. The `_tag` field enables type-safe error matching without services or schemas.

```typescript
import { Data } from "effect";

class TimeoutError extends Data.TaggedError("TimeoutError")<{
  operation: string;
  durationMs: number;
}> {}

class NotFoundError extends Data.TaggedError("NotFoundError")<{
  resource: string;
  id: string;
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  field: string;
  message: string;
}> {}
```

### Catching Errors by Tag

Use `catchTag` for single tags, `catchTags` for multiple. Both preserve type narrowing.

```typescript
const result =
  yield *
  fetchUser("123").pipe(
    Effect.catchTag("NotFoundError", (error) =>
      Effect.succeed({ id: error.id, name: "Unknown", fallback: true }),
    ),
    Effect.catchTag("TimeoutError", (error) =>
      Effect.fail(
        new ServiceUnavailableError({
          message: `${error.operation} timed out`,
        }),
      ),
    ),
  );

// Or handle multiple tags at once
const result =
  yield *
  fetchUser("123").pipe(
    Effect.catchTags({
      NotFoundError: (error) => Effect.succeed(defaultUser),
      ValidationError: (error) => Effect.fail(new BadRequestError({ message: error.message })),
    }),
  );
```

## Timeouts

### Basic Timeout (raises TimeoutException)

```typescript
const result = yield * fetchUser("123").pipe(Effect.timeout("5 seconds"));
```

### Timeout with Custom Error

```typescript
const result =
  yield *
  fetchUser("123").pipe(
    Effect.timeoutFail({
      duration: "5 seconds",
      onTimeout: () => new TimeoutError({ operation: "fetchUser", durationMs: 5000 }),
    }),
  );
```

### Timeout with Fallback Value

```typescript
const result =
  yield *
  fetchUser("123").pipe(
    Effect.timeoutTo({
      duration: "5 seconds",
      onSuccess: (user) => user,
      onTimeout: () => defaultUser,
    }),
  );
```

## Retries

### Fixed Retry Count

```typescript
import { Schedule } from "effect";

const result = yield * fetchUser("123").pipe(Effect.retry({ times: 3 }));
```

### Exponential Backoff

```typescript
const result =
  yield *
  fetchUser("123").pipe(
    Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(5)))),
  );
```

### Retry Only Specific Errors

```typescript
const result =
  yield *
  fetchUser("123").pipe(
    Effect.retry({
      times: 3,
      while: (error) => error._tag === "TimeoutError",
    }),
  );
```

### Retry with Fallback on Exhaustion

```typescript
const result =
  yield *
  Effect.retryOrElse(fetchUser("123"), { times: 3 }, (error, fiberId) =>
    Effect.succeed(defaultUser),
  );
```

## Combining Timeout + Retry

```typescript
const robustFetch = Effect.fn("robustFetch")(function* (userId: string) {
  const user = yield* fetchUser(userId).pipe(
    Effect.timeoutFail({
      duration: "3 seconds",
      onTimeout: () => new TimeoutError({ operation: "fetchUser", durationMs: 3000 }),
    }),
    Effect.retry(Schedule.exponential("200 millis").pipe(Schedule.compose(Schedule.recurs(3)))),
  );
  return user;
});
```

## Fallbacks

```typescript
// Try primary, fall back to secondary on any failure
const result = yield * fetchFromPrimary(id).pipe(Effect.orElse(() => fetchFromSecondary(id)));

// Fall back to a default value
const result = yield * fetchUser(id).pipe(Effect.orElseSucceed(() => defaultUser));

// Remap the error type on failure
const result =
  yield *
  fetchUser(id).pipe(
    Effect.orElseFail(() => new ServiceUnavailableError({ message: "All sources failed" })),
  );

// Try multiple sources, use the first that succeeds
const result =
  yield * Effect.firstSuccessOf([fetchFromCache(id), fetchFromPrimary(id), fetchFromSecondary(id)]);
```

## Caching

### Cache an Effect with TTL

```typescript
import { Effect } from "effect";

const cachedConfig = Effect.cachedWithTTL(
  Effect.tryPromise(() => fetch("/api/config").then((r) => r.json())),
  "5 minutes",
);

// Use it - first call fetches, subsequent calls return cached value within TTL
const program = Effect.gen(function* () {
  const getConfig = yield* cachedConfig;
  const config1 = yield* getConfig;
  const config2 = yield* getConfig; // same value, no re-fetch
});
```

### Cache with Manual Invalidation

```typescript
const [getConfig, invalidate] = yield * Effect.cachedInvalidateWithTTL(fetchConfig, "10 minutes");

const config = yield * getConfig;
yield * invalidate; // force re-fetch on next call
```

### Memoize a Function by Arguments

```typescript
const memoizedFetchUser =
  yield *
  Effect.cachedFunction((userId: string) =>
    Effect.tryPromise(() => fetch(`/api/users/${userId}`).then((r) => r.json())),
  );

const user1 = yield * memoizedFetchUser("123"); // fetches
const user2 = yield * memoizedFetchUser("123"); // returns cached
const user3 = yield * memoizedFetchUser("456"); // fetches (different key)
```

## Concurrency

### Parallel Execution

```typescript
// Run all effects in parallel (unbounded)
const [users, posts, comments] =
  yield *
  Effect.all([fetchUsers, fetchPosts, fetchComments], {
    concurrency: "unbounded",
  });

// Bounded concurrency (e.g., max 5 at a time)
const results = yield * Effect.all(tasks, { concurrency: 5 });

// Parallel forEach
const enrichedUsers = yield * Effect.forEach(userIds, (id) => fetchUser(id), { concurrency: 10 });
```

### Racing (First to Succeed)

```typescript
// Race two effects, take the first to complete
const result = yield * Effect.race(fetchFromEast, fetchFromWest);

// Race many effects
const result = yield * Effect.raceAll([fetchFromCache(id), fetchFromDb(id), fetchFromRemote(id)]);
```

## Pattern Matching

Use `Match` for exhaustive, type-safe branching on tagged unions and error types.

### Matching Tagged Errors

```typescript
import { Match } from "effect";

type ApiError = NotFoundError | TimeoutError | ValidationError;

const describeError = (error: ApiError) =>
  Match.value(error).pipe(
    Match.tag("NotFoundError", (e) => `${e.resource} ${e.id} not found`),
    Match.tag("TimeoutError", (e) => `${e.operation} timed out after ${e.durationMs}ms`),
    Match.tag("ValidationError", (e) => `Invalid ${e.field}: ${e.message}`),
    Match.exhaustive,
  );
```

### Matching by Type (Reusable Matcher)

```typescript
const handleResult = Match.type<string | number | boolean>().pipe(
  Match.when(Match.string, (s) => `string: ${s}`),
  Match.when(Match.number, (n) => `number: ${n}`),
  Match.when(Match.boolean, (b) => `boolean: ${b}`),
  Match.exhaustive,
);

handleResult("hello"); // "string: hello"
handleResult(42); // "number: 42"
```

### Matching with Predicates

```typescript
const categorize = Match.type<{ status: number }>().pipe(
  Match.when({ status: (s) => s >= 500 }, () => "server_error"),
  Match.when({ status: (s) => s >= 400 }, () => "client_error"),
  Match.when({ status: (s) => s >= 200 }, () => "success"),
  Match.orElse(() => "unknown"),
);
```

## Tracing

### Adding Spans

`Effect.fn` automatically creates a span with the given name. For additional spans or annotations:

```typescript
const fetchAndProcess = Effect.fn("fetchAndProcess")(function* (userId: string) {
  yield* Effect.annotateCurrentSpan("userId", userId);

  const user = yield* fetchUser(userId).pipe(Effect.withSpan("fetchUser"));

  const processed = yield* processUser(user).pipe(Effect.withSpan("processUser"));

  yield* Effect.annotateCurrentSpan("processed", true);
  return processed;
});
```

### Logging within Effects

```typescript
const program = Effect.fn("program")(function* () {
  yield* Effect.log("Starting operation");
  const result = yield* doWork();
  yield* Effect.log("Operation complete", { resultId: result.id });
  return result;
});
```

## Complete Example: Robust API Call

Combining all patterns into a single portable function:

```typescript
import { Effect, Data, Schedule, Match } from "effect";

class ApiError extends Data.TaggedError("ApiError")<{
  url: string;
  status: number;
  message: string;
}> {}

class ApiTimeoutError extends Data.TaggedError("ApiTimeoutError")<{
  url: string;
  durationMs: number;
}> {}

const fetchApi = Effect.fn("fetchApi")(function* <T>(url: string) {
  yield* Effect.annotateCurrentSpan("url", url);
  yield* Effect.log("Fetching", { url });

  const response = yield* Effect.tryPromise({
    try: () => fetch(url),
    catch: () => new ApiError({ url, status: 0, message: "Network error" }),
  }).pipe(
    Effect.timeoutFail({
      duration: "10 seconds",
      onTimeout: () => new ApiTimeoutError({ url, durationMs: 10_000 }),
    }),
    Effect.retry(Schedule.exponential("500 millis").pipe(Schedule.compose(Schedule.recurs(3)))),
  );

  if (!response.ok) {
    return yield* Effect.fail(
      new ApiError({
        url,
        status: response.status,
        message: response.statusText,
      }),
    );
  }

  return yield* Effect.tryPromise({
    try: () => response.json() as Promise<T>,
    catch: () => new ApiError({ url, status: response.status, message: "Invalid JSON" }),
  });
});

// Usage at the boundary - resolves to a plain Promise
const data = await Effect.runPromise(
  fetchApi<User>("/api/users/123").pipe(
    Effect.catchTag("ApiTimeoutError", () =>
      Effect.succeed({ id: "123", name: "Unknown" } as User),
    ),
  ),
);
```

## Rules

| Rule                       | Guidance                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| No services or layers      | Keep effects self-contained with `R = never`. Use services only when the `effect-best-practices` skill applies. |
| Always `Effect.fn`         | Name every function for automatic tracing spans.                                                                |
| Always `Data.TaggedError`  | Every distinct failure gets its own tagged error class.                                                         |
| Always `Effect.tryPromise` | Never use `Effect.promise` - it swallows errors as defects.                                                     |
| Prefer `catchTag`          | Use `catchTag` / `catchTags` over `catchAll` to preserve type narrowing.                                        |
| Timeout everything         | External calls should always have `Effect.timeout` or `Effect.timeoutFail`.                                     |
| Run at the boundary        | Call `Effect.runPromise` at the outermost call site, not inside effect functions.                               |

## References

- [Creating Effects](https://effect.website/docs/getting-started/creating-effects/)
- [Expected Errors](https://effect.website/docs/error-management/expected-errors/)
- [Fallback](https://effect.website/docs/error-management/fallback/)
- [Retrying](https://effect.website/docs/error-management/retrying/)
- [Timing Out](https://effect.website/docs/error-management/timing-out/)
- [Pattern Matching](https://effect.website/docs/code-style/pattern-matching/)
- [Basic Concurrency](https://effect.website/docs/concurrency/basic-concurrency/)
- [Caching Effects](https://effect.website/docs/caching/caching-effects/)
- [Tracing](https://effect.website/docs/observability/tracing/)
