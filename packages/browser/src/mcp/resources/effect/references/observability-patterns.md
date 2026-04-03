# Observability Patterns

## Structured Logging with Effect.log

**Always use Effect.log** instead of console.log. Effect.log provides:

- Structured data
- Log levels
- Integration with telemetry systems
- Testability

### Basic Logging

```typescript
// Simple message
yield * Effect.log("Processing started");

// With structured data
yield *
  Effect.log("Processing order", {
    orderId,
    userId,
    amount,
    currency,
  });

// Different log levels
yield * Effect.logDebug("Cache lookup", { key, hit: true });
yield * Effect.logInfo("User logged in", { userId });
yield * Effect.logWarning("Rate limit approaching", { current: 95, limit: 100 });
yield * Effect.logError("Payment failed", { orderId, reason: error.message });
yield * Effect.logFatal("Database connection lost");
```

### Logging in Services

```typescript
const processOrder = Effect.fn("OrderService.processOrder")(function* (input: OrderInput) {
  yield* Effect.log("Starting order processing", { orderId: input.orderId });

  const result = yield* validateAndProcess(input).pipe(
    Effect.tap(() => Effect.log("Order processed successfully")),
    Effect.tapError((err) =>
      Effect.logError("Order processing failed", {
        orderId: input.orderId,
        error: err._tag,
        message: err.message,
      }),
    ),
  );

  return result;
});
```

## Effect.fn for Automatic Tracing

**Always use Effect.fn** for service methods. This automatically creates spans with proper names:

```typescript
// Creates span: "UserService.findById"
const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
  // Automatic span creation with:
  // - Start/end timing
  // - Error capture
  // - Parameter tracking (if annotated)
});

// Creates span: "PaymentService.processPayment"
const processPayment = Effect.fn("PaymentService.processPayment")(function* (
  orderId: OrderId,
  amount: number,
) {
  // ...
});
```

### Naming Convention

Use `ServiceName.methodName` format consistently:

- `UserService.findById`
- `OrderService.create`
- `PaymentService.refund`
- `NotificationService.sendEmail`

## Span Annotations

Add important context to spans, but don't overdo it:

```typescript
const processOrder = Effect.fn("OrderService.process")(function* (orderId: OrderId) {
  // GOOD - Important business identifiers
  yield* Effect.annotateCurrentSpan("orderId", orderId);
  yield* Effect.annotateCurrentSpan("userId", order.userId);
  yield* Effect.annotateCurrentSpan("totalAmount", order.total);

  // BAD - Too much detail, creates noise
  // yield* Effect.annotateCurrentSpan("step", "validating")
  // yield* Effect.annotateCurrentSpan("itemCount", order.items.length)
  // yield* Effect.annotateCurrentSpan("item0Name", order.items[0].name)
});
```

### What to Annotate

**Do annotate:**

- Entity IDs (orderId, userId, etc.)
- Important business values (amounts, statuses)
- Error context when failing

**Don't annotate:**

- Step-by-step progress
- Individual item details
- Internal implementation state
- Sensitive data (PII, secrets)

## Metrics

### Counter

```typescript
import { Metric } from "effect";

// Define metrics at module level
const ordersProcessed = Metric.counter("orders_processed", {
  description: "Total orders processed",
});

const ordersFailed = Metric.counter("orders_failed", {
  description: "Total orders that failed processing",
});

// Use in service
const processOrder = Effect.fn("OrderService.process")(function* (input: OrderInput) {
  return yield* process(input).pipe(
    Effect.tap(() => Metric.increment(ordersProcessed)),
    Effect.tapError(() => Metric.increment(ordersFailed)),
  );
});
```

### Counter with Tags

```typescript
const httpRequests = Metric.counter("http_requests_total", {
  description: "Total HTTP requests",
});

// Tag with method and status
yield *
  Metric.increment(httpRequests).pipe(
    Metric.tagged("method", request.method),
    Metric.tagged("status", String(response.status)),
    Metric.tagged("path", request.path),
  );
```

### Gauge

```typescript
const activeConnections = Metric.gauge("active_connections", {
  description: "Number of active connections",
});

// Update gauge
yield * Metric.set(activeConnections, connectionCount);

// Or increment/decrement
yield * Metric.increment(activeConnections);
yield * Metric.decrement(activeConnections);
```

### Histogram

```typescript
const requestDuration = Metric.histogram("request_duration_ms", {
  description: "Request duration in milliseconds",
  boundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000],
});

// Record value
yield * Metric.update(requestDuration, durationMs);

// Or use timer helper
const timedEffect = effect.pipe(Metric.timerWithHistogram(requestDuration));
```

## Configuration with Config

**Always use Config** instead of process.env:

### Basic Config

```typescript
import { Config, Effect } from "effect";

const config = Config.all({
  port: Config.integer("PORT").pipe(Config.withDefault(3000)),
  host: Config.string("HOST").pipe(Config.withDefault("localhost")),
  env: Config.literal("development", "staging", "production")("NODE_ENV"),
});

// Use in layer
const ServerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const { port, host, env } = yield* config;
    return Layer.succeed(ServerConfig, { port, host, env });
  }),
);
```

### Config with Validation

```typescript
const dbConfig = Config.all({
  host: Config.string("DB_HOST"),
  port: Config.integer("DB_PORT").pipe(
    Config.validate({
      message: "Port must be between 1 and 65535",
      validation: (p) => p >= 1 && p <= 65535,
    }),
  ),
  database: Config.string("DB_NAME"),
  maxConnections: Config.integer("DB_MAX_CONNECTIONS").pipe(
    Config.withDefault(10),
    Config.validate({
      message: "Max connections must be positive",
      validation: (n) => n > 0,
    }),
  ),
});
```

### Secret Config

```typescript
// For sensitive values that shouldn't be logged
const secretConfig = Config.all({
  apiKey: Config.secret("API_KEY"), // Returns Secret<string>
  dbPassword: Config.secret("DB_PASSWORD"),
});

// Using secrets
const program = Effect.gen(function* () {
  const { apiKey, dbPassword } = yield* secretConfig;

  // Secret values are wrapped - use Secret.value to unwrap
  const key = Secret.value(apiKey);

  // Logging a Secret shows "[REDACTED]"
  yield* Effect.log("Config loaded", { apiKey }); // Safe - shows [REDACTED]
});
```

### Config with Nested Structure

```typescript
const appConfig = Config.all({
  server: Config.all({
    port: Config.integer("SERVER_PORT"),
    host: Config.string("SERVER_HOST"),
  }),
  database: Config.all({
    url: Config.string("DATABASE_URL"),
    pool: Config.integer("DATABASE_POOL_SIZE").pipe(Config.withDefault(10)),
  }),
  features: Config.all({
    enableBeta: Config.boolean("ENABLE_BETA").pipe(Config.withDefault(false)),
    maxUploadSize: Config.integer("MAX_UPLOAD_SIZE").pipe(Config.withDefault(10485760)),
  }),
});
```

## Log Level Configuration

```typescript
import { Logger, LogLevel } from "effect";

// Set log level via config
const LoggerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const level = yield* Config.literal(
      "debug",
      "info",
      "warning",
      "error",
    )("LOG_LEVEL").pipe(Config.withDefault("info"));

    const logLevel = {
      debug: LogLevel.Debug,
      info: LogLevel.Info,
      warning: LogLevel.Warning,
      error: LogLevel.Error,
    }[level];

    return Logger.minimumLogLevel(logLevel);
  }),
);

// Production: structured JSON logging
const JsonLoggerLive = Logger.json;
```

## Combining Observability

```typescript
const processOrder = Effect.fn("OrderService.process")(function* (input: OrderInput) {
  const startTime = yield* Effect.clockWith((clock) => clock.currentTimeMillis);

  // Annotate span
  yield* Effect.annotateCurrentSpan("orderId", input.orderId);
  yield* Effect.annotateCurrentSpan("userId", input.userId);

  // Log start
  yield* Effect.log("Processing order", { orderId: input.orderId });

  const result = yield* process(input).pipe(
    Effect.tap((order) =>
      Effect.gen(function* () {
        const endTime = yield* Effect.clockWith((c) => c.currentTimeMillis);
        const duration = endTime - startTime;

        // Record metric
        yield* Metric.update(orderProcessingDuration, duration);
        yield* Metric.increment(ordersProcessed);

        // Log completion
        yield* Effect.log("Order processed", {
          orderId: input.orderId,
          durationMs: duration,
        });
      }),
    ),
    Effect.tapError((err) =>
      Effect.gen(function* () {
        yield* Metric.increment(ordersFailed);
        yield* Effect.logError("Order processing failed", {
          orderId: input.orderId,
          error: err._tag,
        });
      }),
    ),
  );

  return result;
});
```
