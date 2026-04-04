# Schema Patterns

## Branded Types for IDs

**Always brand entity IDs** to prevent accidentally passing the wrong ID type:

```typescript
import { Schema } from "effect";

// Entity IDs - always branded with namespace
export const UserId = Schema.UUID.pipe(Schema.brand("@App/UserId"));
export type UserId = Schema.Schema.Type<typeof UserId>;

export const OrganizationId = Schema.UUID.pipe(Schema.brand("@App/OrganizationId"));
export type OrganizationId = Schema.Schema.Type<typeof OrganizationId>;

export const OrderId = Schema.UUID.pipe(Schema.brand("@App/OrderId"));
export type OrderId = Schema.Schema.Type<typeof OrderId>;

export const ProductId = Schema.UUID.pipe(Schema.brand("@App/ProductId"));
export type ProductId = Schema.Schema.Type<typeof ProductId>;
```

### Branding Convention

Use `@Namespace/EntityName` format:

- `@App/UserId` - Main application entities
- `@Billing/InvoiceId` - Billing domain entities
- `@External/StripeCustomerId` - External system IDs

### Creating Branded Values

```typescript
// From string (validates UUID format)
const userId = Schema.decodeSync(UserId)("123e4567-e89b-12d3-a456-426614174000");

// Generate new ID
const newUserId = UserId.make(crypto.randomUUID());

// Type error - can't mix ID types
const order = yield * orderService.findById(userId); // Error: UserId is not OrderId
```

### When NOT to Brand

Don't brand simple strings that don't need type safety:

```typescript
// NOT branded - acceptable
export const Url = Schema.String;
export const FilePath = Schema.String;
export const EmailAddress = Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));

// These don't need branding because:
// 1. They don't cross service boundaries in ways that could be confused
// 2. They're typically validated by format, not by type
```

## Schema.Struct for Domain Types

**Prefer Schema.Struct** over TypeScript interfaces for domain types:

```typescript
// CORRECT - Schema.Struct
export const User = Schema.Struct({
  id: UserId,
  email: Schema.String,
  name: Schema.String,
  organizationId: OrganizationId,
  role: Schema.Literal("admin", "member", "viewer"),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
});
export type User = Schema.Schema.Type<typeof User>;

// Can derive encoded type for database/API
export type UserEncoded = Schema.Schema.Encoded<typeof User>;
```

### Input Types for Mutations

```typescript
export const CreateUserInput = Schema.Struct({
  email: Schema.String.pipe(
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    Schema.annotations({ description: "Valid email address" }),
  ),
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  organizationId: OrganizationId,
  role: Schema.optionalWith(Schema.Literal("admin", "member", "viewer"), {
    default: () => "member" as const,
  }),
});
export type CreateUserInput = Schema.Schema.Type<typeof CreateUserInput>;

export const UpdateUserInput = Schema.Struct({
  name: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  role: Schema.optional(Schema.Literal("admin", "member", "viewer")),
});
export type UpdateUserInput = Schema.Schema.Type<typeof UpdateUserInput>;
```

## Schema.transform and transformOrFail

**Use transforms** instead of manual parsing:

```typescript
// Transform string to Date
export const DateFromString = Schema.transform(Schema.String, Schema.DateTimeUtc, {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
});

// Transform with validation (can fail)
export const PositiveNumber = Schema.transformOrFail(
  Schema.Number,
  Schema.Number.pipe(Schema.brand("PositiveNumber")),
  {
    decode: (n, _, ast) =>
      n > 0
        ? ParseResult.succeed(n as Schema.Schema.Type<typeof PositiveNumber>)
        : ParseResult.fail(new ParseResult.Type(ast, n, "Must be positive")),
    encode: ParseResult.succeed,
  },
);
```

### Common Transforms

```typescript
// JSON string to object
export const JsonFromString = <A, I>(schema: Schema.Schema<A, I>) =>
  Schema.transform(Schema.String, schema, {
    decode: (s) => JSON.parse(s),
    encode: (a) => JSON.stringify(a),
  });

// Comma-separated string to array
export const CommaSeparatedList = Schema.transform(Schema.String, Schema.Array(Schema.String), {
  decode: (s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  encode: (arr) => arr.join(","),
});

// Cents to dollars
export const DollarsFromCents = Schema.transform(Schema.Number.pipe(Schema.int()), Schema.Number, {
  decode: (cents) => cents / 100,
  encode: (dollars) => Math.round(dollars * 100),
});
```

## Schema.Class for Entities with Methods

Use `Schema.Class` when entities need methods:

```typescript
export class User extends Schema.Class<User>("User")({
  id: UserId,
  email: Schema.String,
  name: Schema.String,
  role: Schema.Literal("admin", "member", "viewer"),
  createdAt: Schema.DateTimeUtc,
}) {
  get isAdmin(): boolean {
    return this.role === "admin";
  }

  get displayName(): string {
    return this.name || this.email.split("@")[0];
  }

  canAccessResource(resource: Resource): boolean {
    if (this.isAdmin) return true;
    return resource.ownerId === this.id;
  }
}

// Usage
const user = new User({
  id: UserId.make(crypto.randomUUID()),
  email: "alice@example.com",
  name: "Alice",
  role: "member",
  createdAt: new Date(),
});

console.log(user.displayName); // "Alice"
console.log(user.isAdmin); // false
```

## Schema.annotations

Add annotations for documentation and validation messages:

```typescript
export const CreateOrderInput = Schema.Struct({
  productId: ProductId.pipe(Schema.annotations({ description: "The product to order" })),
  quantity: Schema.Number.pipe(
    Schema.int(),
    Schema.positive(),
    Schema.annotations({
      description: "Number of items to order",
      examples: [1, 5, 10],
    }),
  ),
  shippingAddress: Schema.Struct({
    line1: Schema.String.pipe(Schema.annotations({ description: "Street address" })),
    line2: Schema.optional(Schema.String),
    city: Schema.String,
    state: Schema.String.pipe(Schema.length(2)),
    zip: Schema.String.pipe(Schema.pattern(/^\d{5}(-\d{4})?$/)),
  }).pipe(Schema.annotations({ description: "Shipping destination" })),
}).pipe(
  Schema.annotations({
    title: "Create Order Input",
    description: "Input for creating a new order",
  }),
);
```

## Optional Fields

Use `Schema.optional` and `Schema.optionalWith`:

```typescript
export const UserPreferences = Schema.Struct({
  // Optional, undefined if not provided
  theme: Schema.optional(Schema.Literal("light", "dark")),

  // Optional with default value
  language: Schema.optionalWith(Schema.String, { default: () => "en" }),

  // Optional with null support (for database compatibility)
  bio: Schema.NullOr(Schema.String),

  // Optional but must be present if set (no undefined)
  timezone: Schema.optional(Schema.String, { exact: true }),
});
```

## Union Types and Discriminated Unions

```typescript
// Simple union
export const PaymentMethod = Schema.Union(
  Schema.Literal("card"),
  Schema.Literal("bank_transfer"),
  Schema.Literal("crypto"),
);

// Discriminated union (tagged)
export const PaymentDetails = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("Card"),
    cardNumber: Schema.String,
    expiry: Schema.String,
    cvv: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("BankTransfer"),
    accountNumber: Schema.String,
    routingNumber: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("Crypto"),
    walletAddress: Schema.String,
    network: Schema.Literal("ethereum", "bitcoin", "solana"),
  }),
);
export type PaymentDetails = Schema.Schema.Type<typeof PaymentDetails>;

// Usage with match
const processPayment = (details: PaymentDetails) => {
  switch (details._tag) {
    case "Card":
      return processCard(details.cardNumber, details.expiry, details.cvv);
    case "BankTransfer":
      return processBankTransfer(details.accountNumber, details.routingNumber);
    case "Crypto":
      return processCrypto(details.walletAddress, details.network);
  }
};
```

## Enums and Literals

```typescript
// Use Literal for small, fixed sets
export const UserRole = Schema.Literal("admin", "member", "viewer");
export type UserRole = Schema.Schema.Type<typeof UserRole>;

// Use Enums for larger sets or when you need runtime values
export const OrderStatus = Schema.Enums({
  Pending: "pending",
  Processing: "processing",
  Shipped: "shipped",
  Delivered: "delivered",
  Cancelled: "cancelled",
} as const);
export type OrderStatus = Schema.Schema.Type<typeof OrderStatus>;
```

## Recursive Schemas

```typescript
interface Category {
  id: string;
  name: string;
  children: readonly Category[];
}

export const Category: Schema.Schema<Category> = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  children: Schema.Array(Schema.suspend(() => Category)),
});
```

## Decoding and Encoding

```typescript
// Decode (parse) - use in services
const parseUser = Schema.decodeUnknown(User);
const result = yield * parseUser(rawData); // Effect<User, ParseError>

// Decode sync - only in controlled contexts
const user = Schema.decodeUnknownSync(User)(rawData);

// Encode - for serialization
const encodeUser = Schema.encode(User);
const encoded = yield * encodeUser(user); // Effect<UserEncoded, ParseError>
```
