# Service Patterns

## Effect.Service Over Context.Tag

**Always prefer `Effect.Service`** for defining business logic services. This is the modern, recommended approach that provides:

1. **Built-in `Default` layer** - No manual layer creation needed
2. **Automatic accessors** - Direct method calls via `ServiceName.method()`
3. **Proper dependency declaration** - Dependencies are explicit and type-checked
4. **Consistent structure** - All services follow the same pattern

### Basic Service Definition

```typescript
import { Effect, Layer } from "effect";

export class UserService extends Effect.Service<UserService>()("UserService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
      // Implementation
    });

    const findByEmail = Effect.fn("UserService.findByEmail")(function* (email: string) {
      // Implementation
    });

    const create = Effect.fn("UserService.create")(function* (input: CreateUserInput) {
      // Implementation
    });

    return { findById, findByEmail, create };
  }),
}) {}
```

### Service with Dependencies

**Critical:** Always declare dependencies using the `dependencies` array. This ensures:

- Dependencies are automatically provided when using `ServiceName.Default`
- Type errors if dependencies are missing
- No manual `Layer.provide` at usage sites

```typescript
export class OrderService extends Effect.Service<OrderService>()("OrderService", {
  accessors: true,
  dependencies: [UserService.Default, ProductService.Default, InventoryService.Default],
  effect: Effect.gen(function* () {
    // Dependencies are automatically available
    const users = yield* UserService;
    const products = yield* ProductService;
    const inventory = yield* InventoryService;

    const create = Effect.fn("OrderService.create")(function* (input: CreateOrderInput) {
      // Validate user exists
      const user = yield* users.findById(input.userId);

      // Check product availability
      const product = yield* products.findById(input.productId);
      const available = yield* inventory.checkAvailability(input.productId, input.quantity);

      if (!available) {
        return yield* Effect.fail(
          new InsufficientInventoryError({
            productId: input.productId,
            message: "Not enough inventory",
          }),
        );
      }

      // Create order...
    });

    return { create };
  }),
}) {}
```

### Wrong: Leaking Dependencies

```typescript
// WRONG - Dependencies not declared, must be provided manually
export class OrderService extends Effect.Service<OrderService>()("OrderService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const users = yield* UserService; // Dependency not in `dependencies` array!
    // ...
  }),
}) {}

// Now every usage site must do this:
const program = OrderService.create(input).pipe(
  Effect.provide(UserService.Default), // Annoying and error-prone
);
```

## Effect.fn for Tracing

**Always wrap service methods with `Effect.fn`**. This provides automatic tracing with meaningful span names.

### Naming Convention

Use `ServiceName.methodName` format for span names:

```typescript
const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
  yield* Effect.annotateCurrentSpan("userId", id);
  // Implementation
});

const processPayment = Effect.fn("PaymentService.processPayment")(function* (
  orderId: OrderId,
  amount: number,
  currency: string,
) {
  yield* Effect.annotateCurrentSpan("orderId", orderId);
  yield* Effect.annotateCurrentSpan("amount", amount);
  yield* Effect.annotateCurrentSpan("currency", currency);
  // Implementation
});
```

### Annotating Spans

Add important context to spans, but don't overdo it:

```typescript
// CORRECT - Important business identifiers
yield * Effect.annotateCurrentSpan("userId", userId);
yield * Effect.annotateCurrentSpan("orderId", orderId);
yield * Effect.annotateCurrentSpan("amount", amount);

// WRONG - Too much detail, noise in traces
yield * Effect.annotateCurrentSpan("userEmail", user.email);
yield * Effect.annotateCurrentSpan("userName", user.name);
yield * Effect.annotateCurrentSpan("userCreatedAt", user.createdAt);
yield * Effect.annotateCurrentSpan("step", "validating");
yield * Effect.annotateCurrentSpan("step", "processing");
yield * Effect.annotateCurrentSpan("step", "completing");
```

## When Context.Tag is Acceptable

`Context.Tag` is appropriate **only** for infrastructure that's injected at runtime:

### Cloudflare Worker Bindings

```typescript
import { Context } from "effect";

// These are provided by the runtime, not created by our code
export class KVNamespace extends Context.Tag("KVNamespace")<KVNamespace, CloudflareKVNamespace>() {}

export class R2Bucket extends Context.Tag("R2Bucket")<R2Bucket, CloudflareR2Bucket>() {}

// In the worker entry point
const handler = {
  fetch(request: Request, env: Env) {
    return program.pipe(
      Effect.provideService(KVNamespace, env.MY_KV),
      Effect.provideService(R2Bucket, env.MY_BUCKET),
      Effect.runPromise,
    );
  },
};
```

### Database/Redis Clients (Infrastructure)

```typescript
// Infrastructure provided at app root - acceptable as Context.Tag
// But prefer using @effect/sql or similar typed clients

import { PgClient } from "@effect/sql-pg";

// PgClient is already a Context.Tag from the library
// Just provide it at the app root
const DatabaseLive = PgClient.layer({
  host: Config.string("DB_HOST"),
  port: Config.integer("DB_PORT"),
  database: Config.string("DB_NAME"),
  // ...
});
```

## Single Responsibility

Each service should have a focused responsibility:

```typescript
// CORRECT - Focused services
export class UserService extends Effect.Service<UserService>()("UserService", {
  /* user operations */
}) {}
export class AuthService extends Effect.Service<AuthService>()("AuthService", {
  /* auth operations */
}) {}
export class NotificationService extends Effect.Service<NotificationService>()(
  "NotificationService",
  {
    /* notifications */
  },
) {}

// WRONG - God service doing everything
export class AppService extends Effect.Service<AppService>()("AppService", {
  effect: Effect.gen(function* () {
    return {
      createUser,
      deleteUser,
      login,
      logout,
      sendEmail,
      sendPush,
      processPayment,
      // ... 50 more methods
    };
  }),
}) {}
```

## Service Interface Patterns

### Return Types

Services should return `Effect` types, never `Promise`:

```typescript
// CORRECT
const findById = Effect.fn("UserService.findById")(function* (
  id: UserId,
): Effect.Effect<User, UserNotFoundError> {
  // ...
});

// WRONG - Promise in service interface
const findById = async (id: UserId): Promise<User> => {
  // ...
};
```

### Use Option for Nullable Results

```typescript
// CORRECT - findById can fail, findByIdOption returns Option
const findById = Effect.fn("UserService.findById")(function* (
  id: UserId,
): Effect.Effect<User, UserNotFoundError> {
  const maybeUser = yield* repo.findById(id);
  return yield* Option.match(maybeUser, {
    onNone: () => Effect.fail(new UserNotFoundError({ userId: id, message: "Not found" })),
    onSome: Effect.succeed,
  });
});

const findByIdOption = Effect.fn("UserService.findByIdOption")(function* (
  id: UserId,
): Effect.Effect<Option<User>> {
  return yield* repo.findById(id);
});
```

## Testing Services

Create test implementations using the same pattern:

```typescript
// Test implementation
export const UserServiceTest = Layer.succeed(
  UserService,
  UserService.of({
    findById: (id) => Effect.succeed(mockUser),
    create: (input) => Effect.succeed({ ...mockUser, ...input }),
  }),
);

// Or with Effect.Service for stateful mocks
export class UserServiceTest extends Effect.Service<UserService>()("UserService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const users = new Map<string, User>();

    const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
      const user = users.get(id);
      if (!user)
        return yield* Effect.fail(new UserNotFoundError({ userId: id, message: "Not found" }));
      return user;
    });

    const create = Effect.fn("UserService.create")(function* (input: CreateUserInput) {
      const user = { id: UserId.make(crypto.randomUUID()), ...input };
      users.set(user.id, user);
      return user;
    });

    return { findById, create };
  }),
}) {}
```
