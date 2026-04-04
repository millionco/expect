# Error Patterns

## Why Explicit Error Types?

Generic errors like `BadRequestError` or `NotFoundError` seem convenient but create problems:

| Generic Error         | Problems                                                |
| --------------------- | ------------------------------------------------------- |
| `NotFoundError`       | Which resource? How should frontend recover?            |
| `BadRequestError`     | What's invalid? Can user fix it?                        |
| `UnauthorizedError`   | Session expired? Wrong credentials? Missing permission? |
| `InternalServerError` | Retryable? User action needed?                          |

**Explicit errors enable:**

1. **Specific UI messages** - "Your session expired" vs generic "Unauthorized"
2. **Targeted recovery** - Refresh token vs show login page
3. **Better observability** - Group errors by specific type in dashboards
4. **Type-safe handling** - `catchTag("SessionExpiredError")` vs generic catch

### Anti-Pattern: Generic Error Mapping

```typescript
// ❌ WRONG - Collapsing to generic HTTP errors
export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}

// At API boundaries:
Effect.catchTags({
  UserNotFoundError: (err) => Effect.fail(new NotFoundError({ message: "Not found" })),
  ChannelNotFoundError: (err) => Effect.fail(new NotFoundError({ message: "Not found" })),
  MessageNotFoundError: (err) => Effect.fail(new NotFoundError({ message: "Not found" })),
});

// Frontend receives: { _tag: "NotFoundError", message: "Not found" }
// - Can't show specific message ("User doesn't exist" vs "Channel was deleted")
// - Can't take specific action (redirect to user search vs channel list)
// - Debugging is harder (which resource was missing?)
```

```typescript
// ✅ CORRECT - Keep explicit errors all the way to frontend
export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
    "UserNotFoundError",
    { userId: UserId, message: Schema.String },
    HttpApiSchema.annotations({ status: 404 }),
) {}

export class ChannelNotFoundError extends Schema.TaggedError<ChannelNotFoundError>()(
    "ChannelNotFoundError",
    { channelId: ChannelId, message: Schema.String },
    HttpApiSchema.annotations({ status: 404 }),
) {}

// Frontend can handle each case:
Result.builder(result)
    .onErrorTag("UserNotFoundError", (err) => <UserNotFoundMessage userId={err.userId} />)
    .onErrorTag("ChannelNotFoundError", (err) => <ChannelDeletedMessage />)
    .onErrorTag("SessionExpiredError", () => <RedirectToLogin />)
    .render()
```

## Error Naming Conventions

| Pattern                 | Example                                         | Use For                   |
| ----------------------- | ----------------------------------------------- | ------------------------- |
| `{Entity}NotFoundError` | `UserNotFoundError`, `ChannelNotFoundError`     | Resource lookups          |
| `{Entity}{Action}Error` | `UserCreateError`, `MessageUpdateError`         | Mutations that fail       |
| `{Feature}Error`        | `SessionExpiredError`, `RateLimitExceededError` | Feature-specific failures |
| `{Integration}Error`    | `WorkOSUserFetchError`, `StripePaymentError`    | External service errors   |
| `Invalid{Field}Error`   | `InvalidEmailError`, `InvalidPasswordError`     | Validation failures       |

### Rich Error Context

Include context fields that help with debugging and UI handling:

```typescript
// Entity errors → include entity ID
export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
  "UserNotFoundError",
  {
    userId: UserId, // Which user?
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 }),
) {}

// Action errors → include input that failed
export class UserCreateError extends Schema.TaggedError<UserCreateError>()(
  "UserCreateError",
  {
    email: Schema.String, // What email failed?
    reason: Schema.String, // Why? "duplicate", "invalid domain"
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 400 }),
) {}

// Integration errors → include service name and retryable flag
export class StripePaymentError extends Schema.TaggedError<StripePaymentError>()(
  "StripePaymentError",
  {
    stripeErrorCode: Schema.String,
    retryable: Schema.Boolean,
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 402 }),
) {}

// Auth errors → include expiry info
export class SessionExpiredError extends Schema.TaggedError<SessionExpiredError>()(
  "SessionExpiredError",
  {
    sessionId: SessionId,
    expiredAt: Schema.DateTimeUtc,
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 }),
) {}
```

## Schema.TaggedError for All Errors

**Always use `Schema.TaggedError`** for defining errors. This provides:

1. **Serialization** - Errors can be sent over RPC/network
2. **Type safety** - `_tag` discriminator enables `catchTag`
3. **Consistent structure** - All errors have predictable shape
4. **HTTP status mapping** - Via `HttpApiSchema.annotations`

### Basic Error Definition

```typescript
import { Schema } from "effect";
import { HttpApiSchema } from "@effect/platform";

export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
  "UserNotFoundError",
  {
    userId: UserId,
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class UserCreateError extends Schema.TaggedError<UserCreateError>()(
  "UserCreateError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 400 }),
) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
  "ForbiddenError",
  {
    message: Schema.String,
    requiredPermission: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 403 }),
) {}
```

### Required Fields

Every error should have:

- `message: Schema.String` - Human-readable description
- Relevant context fields (IDs, etc.)
- Optional `cause: Schema.optional(Schema.String)` for error chains

## Error Handling with catchTag/catchTags

**Never use `catchAll` or `mapError`** when you can use `catchTag`/`catchTags`. These preserve type information and enable precise error handling.

### catchTag for Single Error Types

```typescript
const findUser = Effect.fn("UserService.findUser")(function* (id: UserId) {
  return yield* repo.findById(id).pipe(
    Effect.catchTag("DatabaseError", (err) =>
      Effect.fail(
        new UserNotFoundError({
          userId: id,
          message: `Database lookup failed: ${err.message}`,
        }),
      ),
    ),
  );
});
```

### catchTags for Multiple Error Types

```typescript
const processOrder = Effect.fn("OrderService.processOrder")(function* (input: OrderInput) {
  return yield* validateAndProcess(input).pipe(
    Effect.catchTags({
      ValidationError: (err) =>
        Effect.fail(
          new OrderValidationError({
            message: err.message,
            field: err.field,
          }),
        ),
      PaymentError: (err) =>
        Effect.fail(
          new OrderPaymentError({
            message: `Payment failed: ${err.message}`,
            code: err.code,
          }),
        ),
      InventoryError: (err) =>
        Effect.fail(
          new OrderInventoryError({
            productId: err.productId,
            message: "Insufficient inventory",
          }),
        ),
    }),
  );
});
```

### Why Not catchAll?

```typescript
// WRONG - Loses type information
yield *
  effect.pipe(
    Effect.catchAll((err) => Effect.fail(new InternalServerError({ message: "Something failed" }))),
  );

// Problems:
// 1. Can't distinguish error types downstream
// 2. Hides useful error context
// 3. Makes debugging harder
// 4. Frontend can't show specific messages
```

## Error Remapping Pattern

Create reusable error remapping functions for common transformations:

```typescript
import { Effect } from "effect";

export const withRemapDbErrors = <A, E, R>(
  effect: Effect.Effect<A, E | DatabaseError | ConnectionError, R>,
  context: { entityType: string; entityId: string },
): Effect.Effect<A, E | EntityNotFoundError | ServiceUnavailableError, R> =>
  effect.pipe(
    Effect.catchTag("DatabaseError", (err) =>
      Effect.fail(
        new EntityNotFoundError({
          entityType: context.entityType,
          entityId: context.entityId,
          message: `${context.entityType} not found`,
        }),
      ),
    ),
    Effect.catchTag("ConnectionError", (err) =>
      Effect.fail(
        new ServiceUnavailableError({
          message: "Database connection unavailable",
          cause: err.message,
        }),
      ),
    ),
  );

// Usage
const findUser = Effect.fn("UserService.findUser")(function* (id: UserId) {
  return yield* repo.findById(id).pipe(withRemapDbErrors({ entityType: "User", entityId: id }));
});
```

## Retryable Errors Pattern

For errors that may be transient, add a `retryable` property:

```typescript
export class ServiceUnavailableError extends Schema.TaggedError<ServiceUnavailableError>()(
  "ServiceUnavailableError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.String),
    retryable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  },
  HttpApiSchema.annotations({ status: 503 }),
) {}

export class RateLimitError extends Schema.TaggedError<RateLimitError>()(
  "RateLimitError",
  {
    message: Schema.String,
    retryAfter: Schema.optional(Schema.Number),
    retryable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  },
  HttpApiSchema.annotations({ status: 429 }),
) {}

// Non-retryable error
export class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  {
    message: Schema.String,
    field: Schema.String,
    retryable: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  },
  HttpApiSchema.annotations({ status: 400 }),
) {}
```

### Retry Based on Error Property

```typescript
import { Effect, Schedule } from "effect";

const withRetry = <A, E extends { retryable?: boolean }, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.retry(
      Schedule.exponential("100 millis").pipe(
        Schedule.intersect(Schedule.recurs(3)),
        Schedule.whileInput((err: E) => err.retryable === true),
      ),
    ),
  );

// Usage
yield * callExternalApi(request).pipe(withRetry);
```

## Error Unions for Activities

When defining workflow activities, use explicit error unions:

```typescript
// Activity error type - union of possible errors
export type GetChannelMembersError = DatabaseError | ChannelNotFoundError;

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  message: Schema.String,
  cause: Schema.optional(Schema.String),
  retryable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
}) {}

export class ChannelNotFoundError extends Schema.TaggedError<ChannelNotFoundError>()(
  "ChannelNotFoundError",
  {
    channelId: ChannelId,
    message: Schema.String,
    retryable: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  },
) {}

// In activity definition
yield *
  Activity.make({
    name: "GetChannelMembers",
    success: ChannelMembersResult,
    error: Schema.Union(DatabaseError, ChannelNotFoundError),
    execute: Effect.gen(function* () {
      // ...
    }),
  });
```

## HTTP Status Codes (Without Generic Errors)

**Map HTTP status codes at the error level, not by creating generic error classes.** Each explicit error can have its own HTTP status.

```typescript
// ✅ CORRECT - Domain errors with HTTP status annotations
export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
  "UserNotFoundError",
  { userId: UserId, message: Schema.String },
  HttpApiSchema.annotations({ status: 404 }), // Status on specific error
) {}

export class ChannelNotFoundError extends Schema.TaggedError<ChannelNotFoundError>()(
  "ChannelNotFoundError",
  { channelId: ChannelId, message: Schema.String },
  HttpApiSchema.annotations({ status: 404 }), // Same status, different error
) {}

export class SessionExpiredError extends Schema.TaggedError<SessionExpiredError>()(
  "SessionExpiredError",
  {
    sessionId: SessionId,
    expiredAt: Schema.DateTimeUtc,
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class InvalidCredentialsError extends Schema.TaggedError<InvalidCredentialsError>()(
  "InvalidCredentialsError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 401 }), // Same status, different meaning
) {}
```

```typescript
// ❌ WRONG - Generic HTTP error classes
export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 401 }),
) {}

// Then mapping everything to it - loses critical information!
Effect.catchTags({
  SessionExpiredError: (err) => Effect.fail(new UnauthorizedError({ message: "Unauthorized" })),
  InvalidCredentialsError: (err) => Effect.fail(new UnauthorizedError({ message: "Unauthorized" })),
  MissingTokenError: (err) => Effect.fail(new UnauthorizedError({ message: "Unauthorized" })),
});
// Frontend can't distinguish: expired session vs wrong password vs missing token
```

### When Generic Errors Are Acceptable

Generic errors are only acceptable for **truly unrecoverable internal errors** where:

- The frontend can only show "Something went wrong"
- No user action can fix it
- You're hiding internal details for security

```typescript
// Acceptable for unrecoverable errors
export class InternalServerError extends Schema.TaggedError<InternalServerError>()(
  "InternalServerError",
  { message: Schema.String, requestId: Schema.optional(Schema.String) },
  HttpApiSchema.annotations({ status: 500 }),
) {}

// Use sparingly - only for truly unexpected errors
Effect.catchAll((unexpectedError) =>
  Effect.fail(
    new InternalServerError({
      message: "An unexpected error occurred",
      requestId: context.requestId,
    }),
  ),
);
```

## Error Logging

Log errors with structured context:

```typescript
const processWithLogging = Effect.fn("OrderService.process")(function* (orderId: OrderId) {
  return yield* processOrder(orderId).pipe(
    Effect.tapError((err) =>
      Effect.log("Order processing failed", {
        orderId,
        errorTag: err._tag,
        errorMessage: err.message,
      }),
    ),
  );
});
```
