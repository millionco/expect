# RPC & Cluster Patterns

## RpcGroup for API Organization

**Use `RpcGroup.make`** to organize related RPC endpoints:

```typescript
import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";

// Group related operations
export const UserRpc = RpcGroup.make("User", {
  // Queries (read operations)
  findById: Rpc.query({
    input: UserId,
    output: User,
    error: UserNotFoundError,
  }),

  list: Rpc.query({
    input: Schema.Struct({
      organizationId: OrganizationId,
      limit: Schema.optionalWith(Schema.Number, { default: () => 50 }),
      offset: Schema.optionalWith(Schema.Number, { default: () => 0 }),
    }),
    output: Schema.Array(User),
    error: Schema.Never,
  }),

  // Mutations (write operations)
  create: Rpc.mutation({
    input: CreateUserInput,
    output: User,
    error: Schema.Union(UserCreateError, ValidationError),
  }),

  update: Rpc.mutation({
    input: Schema.Struct({
      id: UserId,
      data: UpdateUserInput,
    }),
    output: User,
    error: Schema.Union(UserNotFoundError, ValidationError),
  }),

  delete: Rpc.mutation({
    input: UserId,
    output: Schema.Void,
    error: UserNotFoundError,
  }),
});
```

### Query vs Mutation

- **Rpc.query** - Read operations, idempotent, cacheable
- **Rpc.mutation** - Write operations, may have side effects

```typescript
// Query - safe to retry, can be cached
findById: Rpc.query({ ... }),
search: Rpc.query({ ... }),
list: Rpc.query({ ... }),

// Mutation - may modify state
create: Rpc.mutation({ ... }),
update: Rpc.mutation({ ... }),
delete: Rpc.mutation({ ... }),
```

## Error Unions in RPC

**Always use explicit error unions** for RPC error types:

```typescript
// Explicit union of possible errors
create: Rpc.mutation({
    input: CreateOrderInput,
    output: Order,
    error: Schema.Union(
        ValidationError,
        InsufficientInventoryError,
        PaymentFailedError,
        UserNotFoundError,
    ),
}),

// NOT - generic error type
create: Rpc.mutation({
    input: CreateOrderInput,
    output: Order,
    error: GenericError, // WRONG - loses type information
}),
```

## RPC Middleware for Authentication

```typescript
import { RpcMiddleware, Rpc } from "@effect/rpc";
import { Effect, Layer } from "effect";

// Context type for authenticated user
export class CurrentUser extends Context.Tag("CurrentUser")<
  CurrentUser,
  { id: UserId; role: UserRole; organizationId: OrganizationId }
>() {}

// Auth middleware - extracts and validates auth
export class AuthMiddleware extends RpcMiddleware.Tag<AuthMiddleware>()("AuthMiddleware", {
  provides: CurrentUser,
  failure: UnauthorizedError,
}) {}

// Middleware implementation
export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const authService = yield* AuthService;

    return AuthMiddleware.of({
      execute: (request) =>
        Effect.gen(function* () {
          const token = request.headers.get("authorization")?.replace("Bearer ", "");

          if (!token) {
            return yield* Effect.fail(new UnauthorizedError({ message: "Missing token" }));
          }

          const user = yield* authService.validateToken(token).pipe(
            Effect.catchTag("TokenExpiredError", () =>
              Effect.fail(new UnauthorizedError({ message: "Token expired" })),
            ),
            Effect.catchTag("TokenInvalidError", () =>
              Effect.fail(new UnauthorizedError({ message: "Invalid token" })),
            ),
          );

          return user;
        }),
    });
  }),
);

// Protected RPC using middleware
export const ProtectedUserRpc = UserRpc.middleware(AuthMiddleware);
```

## Workflow Definition

**Use `Workflow.make`** with explicit idempotency keys:

```typescript
import { Workflow } from "@effect/cluster";
import { Schema } from "effect";

export const OrderFulfillmentWorkflow = Workflow.make({
  name: "OrderFulfillmentWorkflow",
  payload: {
    id: OrderId, // Execution ID
    orderId: OrderId,
    userId: UserId,
    items: Schema.Array(OrderItem),
    shippingAddress: ShippingAddress,
  },
  // Idempotency key prevents duplicate processing
  idempotencyKey: ({ orderId }) => orderId,
});

export const NotificationWorkflow = Workflow.make({
  name: "NotificationWorkflow",
  payload: {
    id: Schema.String, // Unique execution ID
    messageId: MessageId,
    channelId: ChannelId,
    authorId: UserId,
  },
  idempotencyKey: ({ messageId }) => messageId,
});
```

### Workflow Implementation

```typescript
import { Activity } from "@effect/workflow";
import { Effect } from "effect";

export const OrderFulfillmentWorkflowLayer = OrderFulfillmentWorkflow.toLayer(
  Effect.fn("OrderFulfillmentWorkflow")(function* (payload) {
    // Step 1: Reserve inventory
    const reservation = yield* Activity.make({
      name: "ReserveInventory",
      success: InventoryReservation,
      error: Schema.Union(InsufficientInventoryError, DatabaseError),
      execute: Effect.gen(function* () {
        const inventory = yield* InventoryService;
        return yield* inventory.reserve(payload.items);
      }),
    });

    // Step 2: Process payment
    const payment = yield* Activity.make({
      name: "ProcessPayment",
      success: PaymentResult,
      error: Schema.Union(PaymentFailedError, PaymentTimeoutError),
      execute: Effect.gen(function* () {
        const payments = yield* PaymentService;
        return yield* payments.charge(payload.userId, payload.items);
      }),
    });

    // Step 3: Create shipment
    const shipment = yield* Activity.make({
      name: "CreateShipment",
      success: Shipment,
      error: Schema.Union(ShippingError, AddressInvalidError),
      execute: Effect.gen(function* () {
        const shipping = yield* ShippingService;
        return yield* shipping.createShipment({
          items: payload.items,
          address: payload.shippingAddress,
          reservationId: reservation.id,
        });
      }),
    });

    // Step 4: Send confirmation
    yield* Activity.make({
      name: "SendConfirmation",
      success: Schema.Void,
      error: NotificationError,
      execute: Effect.gen(function* () {
        const notifications = yield* NotificationService;
        yield* notifications.sendOrderConfirmation({
          userId: payload.userId,
          orderId: payload.orderId,
          trackingNumber: shipment.trackingNumber,
        });
      }),
    });

    return { shipment, payment };
  }),
);
```

## Activity Patterns

**Always include `success` and `error` schemas** in Activity.make:

```typescript
// CORRECT - schemas specified
yield *
  Activity.make({
    name: "SendEmail",
    success: EmailSentResult,
    error: Schema.Union(EmailDeliveryError, EmailTemplateError),
    execute: Effect.gen(function* () {
      // Implementation
      return { messageId: "msg-123", sentAt: new Date() };
    }),
  });

// WRONG - missing schemas
yield *
  Activity.make({
    name: "SendEmail",
    execute: Effect.gen(function* () {
      // This will not serialize properly across workflow restarts
    }),
  });
```

### Activity Error Handling with Retryable

```typescript
export class ExternalApiError extends Schema.TaggedError<ExternalApiError>()("ExternalApiError", {
  message: Schema.String,
  statusCode: Schema.Number,
  retryable: Schema.Boolean,
}) {
  static fromResponse(response: Response): ExternalApiError {
    return new ExternalApiError({
      message: `API error: ${response.statusText}`,
      statusCode: response.status,
      retryable: response.status >= 500, // 5xx errors are retryable
    });
  }
}

yield *
  Activity.make({
    name: "CallExternalApi",
    success: ApiResponse,
    error: ExternalApiError,
    execute: Effect.gen(function* () {
      const response = yield* fetch(url);
      if (!response.ok) {
        return yield* Effect.fail(ExternalApiError.fromResponse(response));
      }
      return yield* response.json();
    }),
  });
```

## ClusterCron for Scheduled Jobs

```typescript
import { ClusterCron } from "@effect/cluster";

export const DailyReportCron = ClusterCron.make({
  name: "DailyReportCron",
  // Cron expression: every day at 6 AM UTC
  schedule: "0 6 * * *",
});

// Implementation
export const DailyReportCronLayer = DailyReportCron.toLayer(
  Effect.fn("DailyReportCron")(function* () {
    yield* Effect.log("Starting daily report generation");

    const reports = yield* ReportService;
    yield* reports.generateDailyReport();

    yield* Effect.log("Daily report generation complete");
  }),
);
```

## Triggering Workflows

### From HTTP Handler

```typescript
import { HttpApi, HttpApiEndpoint } from "@effect/platform";

const createOrder = HttpApiEndpoint.post("createOrder", "/orders")
  .setPayload(CreateOrderInput)
  .addSuccess(Order)
  .addError(ValidationError);

// Handler triggers workflow
const createOrderHandler = Effect.gen(function* () {
  const input = yield* HttpApi.payload;
  const workflowClient = yield* WorkflowClient;

  // Create order in database
  const order = yield* OrderService.create(input);

  // Trigger async fulfillment workflow
  yield* workflowClient.workflows.OrderFulfillmentWorkflow.execute({
    id: order.id,
    orderId: order.id,
    userId: input.userId,
    items: input.items,
    shippingAddress: input.shippingAddress,
  });

  return order;
});
```

### From Backend Service

```typescript
export class MessageService extends Effect.Service<MessageService>()("MessageService", {
  accessors: true,
  dependencies: [MessageRepo.Default, WorkflowClient.Default],
  effect: Effect.gen(function* () {
    const repo = yield* MessageRepo;
    const workflows = yield* WorkflowClient;

    const create = Effect.fn("MessageService.create")(function* (input: CreateMessageInput) {
      const message = yield* repo.create(input);

      // Trigger notification workflow
      yield* workflows.workflows.NotificationWorkflow.execute({
        id: message.id,
        messageId: message.id,
        channelId: message.channelId,
        authorId: message.authorId,
      });

      return message;
    });

    return { create };
  }),
}) {}
```

## Workflow HTTP API

```typescript
// Expose workflow execution via HTTP
const executeWorkflow = HttpApiEndpoint.post("executeWorkflow", "/workflows/:name/execute")
  .setPath(Schema.Struct({ name: Schema.String }))
  .setPayload(Schema.Unknown)
  .addSuccess(Schema.Struct({ executionId: Schema.String }))
  .addError(WorkflowNotFoundError);

// Handler
const executeWorkflowHandler = Effect.gen(function* () {
  const { name } = yield* HttpApi.path;
  const payload = yield* HttpApi.payload;
  const client = yield* WorkflowClient;

  const workflow = client.workflows[name];
  if (!workflow) {
    return yield* Effect.fail(new WorkflowNotFoundError({ name }));
  }

  const result = yield* workflow.execute(payload);
  return { executionId: payload.id };
});
```
