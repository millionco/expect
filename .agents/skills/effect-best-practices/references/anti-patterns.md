# Anti-Patterns (Forbidden)

These patterns are **never acceptable** in Effect-TS code. Each is listed with rationale and the correct alternative.

## FORBIDDEN: Effect.runSync/runPromise Inside Services

```typescript
// FORBIDDEN
export class UserService extends Effect.Service<UserService>()("UserService", {
  effect: Effect.gen(function* () {
    const findById = (id: UserId) => {
      // Running effects synchronously breaks composition
      const user = Effect.runSync(repo.findById(id));
      return user;
    };
    return { findById };
  }),
}) {}
```

**Why:** Breaks Effect's composition model, loses error handling, can't be tested, loses tracing.

**Correct:**

```typescript
const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
  return yield* repo.findById(id);
});
```

## FORBIDDEN: throw Inside Effect.gen

```typescript
// FORBIDDEN
yield *
  Effect.gen(function* () {
    const user = yield* repo.findById(id);
    if (!user) {
      throw new Error("User not found"); // Bypasses Effect error channel
    }
    return user;
  });
```

**Why:** Throws bypass Effect's error channel, can't be caught with `catchTag`, breaks type safety.

**Correct:**

```typescript
yield *
  Effect.gen(function* () {
    const user = yield* repo.findById(id);
    if (!user) {
      return yield* Effect.fail(new UserNotFoundError({ userId: id, message: "Not found" }));
    }
    return user;
  });
```

## FORBIDDEN: catchAll Losing Type Information

```typescript
// FORBIDDEN
yield *
  someEffect.pipe(
    Effect.catchAll((err) => Effect.fail(new GenericError({ message: "Something failed" }))),
  );
```

**Why:** Loses specific error information, makes debugging harder, prevents specific error handling downstream.

**Correct:**

```typescript
yield *
  someEffect.pipe(
    Effect.catchTags({
      DatabaseError: (err) => Effect.fail(new ServiceUnavailableError({ message: err.message })),
      ValidationError: (err) => Effect.fail(new BadRequestError({ message: err.message })),
    }),
  );
```

## FORBIDDEN: any/unknown Casts

```typescript
// FORBIDDEN
const data = someValue as any;
const result = (await fetch(url)) as unknown as MyType;
```

**Why:** Completely bypasses type safety, can cause runtime errors, loses Effect's type guarantees.

**Correct:**

```typescript
// Use Schema for parsing unknown data
const result = yield * Schema.decodeUnknown(MyType)(someValue);

// Or explicit type guards
if (isMyType(someValue)) {
  // Now safely typed
}
```

## FORBIDDEN: Promise in Service Signatures

```typescript
// FORBIDDEN
export class UserService extends Effect.Service<UserService>()("UserService", {
  effect: Effect.gen(function* () {
    return {
      findById: async (id: UserId): Promise<User> => {
        // Using Promise instead of Effect
      },
    };
  }),
}) {}
```

**Why:** Loses Effect's error handling, can't compose with other Effects, loses tracing/metrics.

**Correct:**

```typescript
const findById = Effect.fn("UserService.findById")(function* (
  id: UserId,
): Effect.Effect<User, UserNotFoundError> {
  // ...
});
```

## FORBIDDEN: console.log

```typescript
// FORBIDDEN
console.log("Processing order:", orderId);
console.error("Error:", error);
```

**Why:** Not structured, not captured by Effect's logging system, lost in production telemetry.

**Correct:**

```typescript
yield * Effect.log("Processing order", { orderId });
yield * Effect.logError("Operation failed", { error: String(error) });
```

## FORBIDDEN: process.env Directly

```typescript
// FORBIDDEN
const apiKey = process.env.API_KEY;
const port = parseInt(process.env.PORT || "3000");
```

**Why:** No validation, no type safety, fails silently if missing, hard to test.

**Correct:**

```typescript
const config =
  yield *
  Config.all({
    apiKey: Config.secret("API_KEY"),
    port: Config.integer("PORT").pipe(Config.withDefault(3000)),
  });
```

## FORBIDDEN: null/undefined in Domain Types

```typescript
// FORBIDDEN
type User = {
  name: string;
  bio: string | null;
  avatar: string | undefined;
};
```

**Why:** Null/undefined handling is error-prone, loses the explicit "absence" semantics.

**Correct:**

```typescript
const User = Schema.Struct({
  name: Schema.String,
  bio: Schema.Option(Schema.String),
  avatar: Schema.Option(Schema.String),
});
```

## FORBIDDEN: Option.getOrThrow

```typescript
// FORBIDDEN
const user = Option.getOrThrow(maybeUser);
const name = pipe(maybeName, Option.getOrThrow);
```

**Why:** Throws exceptions, bypasses Effect's error handling, fails at runtime instead of compile time.

**Correct:**

```typescript
// Handle both cases explicitly
yield *
  Option.match(maybeUser, {
    onNone: () => Effect.fail(new UserNotFoundError({ userId, message: "Not found" })),
    onSome: Effect.succeed,
  });

// Or provide a default
const name = Option.getOrElse(maybeName, () => "Anonymous");

// Or use Option.map for transformations
const upperName = Option.map(maybeName, (n) => n.toUpperCase());
```

## FORBIDDEN: Context.Tag for Business Services

```typescript
// FORBIDDEN
export class UserService extends Context.Tag("UserService")<
    UserService,
    { findById: (id: UserId) => Effect.Effect<User, UserNotFoundError> }
>() {
    static Default = Layer.effect(this, Effect.gen(function* () { ... }))
}
```

**Why:** Requires manual layer creation, no built-in accessors, more boilerplate.

**Correct:**

```typescript
export class UserService extends Effect.Service<UserService>()("UserService", {
    accessors: true,
    dependencies: [...],
    effect: Effect.gen(function* () { ... }),
}) {}
```

## FORBIDDEN: Ignoring Errors with orDie

```typescript
// FORBIDDEN (in most cases)
yield * someEffect.pipe(Effect.orDie);
```

**Why:** Converts recoverable errors to defects (unrecoverable), loses error information.

**Acceptable exceptions:**

- Truly unrecoverable situations (invalid program state)
- After exhausting all recovery options
- In test setup code

**Correct:**

```typescript
// Handle errors explicitly
yield *
  someEffect.pipe(
    Effect.catchTag("RecoverableError", (err) =>
      Effect.fail(new DomainError({ message: err.message })),
    ),
  );
```

## FORBIDDEN: mapError Instead of catchTag

```typescript
// FORBIDDEN
yield * effect.pipe(Effect.mapError((err) => new GenericError({ message: String(err) })));
```

**Why:** Loses error type information, can't discriminate between error types.

**Correct:**

```typescript
yield *
  effect.pipe(
    Effect.catchTag("SpecificError", (err) =>
      Effect.fail(new MappedError({ message: err.message })),
    ),
  );
```

## FORBIDDEN: Mixing Effect and Promise Chains

```typescript
// FORBIDDEN
const result = await someEffect.pipe(Effect.runPromise).then((data) => {
  // Mixing Promise chain with Effect
  return Effect.runPromise(anotherEffect(data));
});
```

**Why:** Loses Effect composition benefits, error handling becomes inconsistent.

**Correct:**

```typescript
const program = Effect.gen(function* () {
  const data = yield* someEffect;
  return yield* anotherEffect(data);
});

const result = await Effect.runPromise(program);
```

## FORBIDDEN: Mutable State Without Ref

```typescript
// FORBIDDEN
let counter = 0;
const increment = Effect.sync(() => {
  counter++;
});
```

**Why:** Race conditions, not testable, not composable, breaks referential transparency.

**Correct:**

```typescript
const program = Effect.gen(function* () {
  const counter = yield* Ref.make(0);
  yield* Ref.update(counter, (n) => n + 1);
  return yield* Ref.get(counter);
});
```

## FORBIDDEN: Using Date.now() or new Date() Directly

```typescript
// FORBIDDEN
const now = new Date();
const timestamp = Date.now();
```

**Why:** Not testable, introduces non-determinism, hard to mock in tests.

**Correct:**

```typescript
import { Clock } from "effect";

const now = yield * Clock.currentTimeMillis;
const date = yield * Clock.currentTimeZone.pipe(Effect.map((tz) => new Date()));
```
