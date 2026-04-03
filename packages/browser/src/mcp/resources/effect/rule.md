---
name: effect-best-practices
description: Enforces Effect-TS patterns for services, errors, layers, and atoms. Use when writing code with Effect.Service, Schema.TaggedError, Layer composition, or effect-atom React components.
version: 1.0.0
---

# Effect-TS Best Practices

## Checklist

### Services

- [ ] Use `Effect.Service` with `accessors: true` — never `Context.Tag` for business logic
- [ ] Declare dependencies via `dependencies: [Dep.Default]` in the service definition
- [ ] Return `{ ... } as const` from service make — explicit public API

### Errors

- [ ] Use `Schema.TaggedError` with `message` field — never plain classes or generic Error
- [ ] One error per distinct failure: `UserNotFoundError`, not generic `NotFoundError`
- [ ] Handle with `catchTag`/`catchTags` — never `catchAll` or `mapError`

### Functions & Tracing

- [ ] Use `Effect.fn("Service.method")` for every effectful function — never anonymous generators
- [ ] Use `Effect.annotateCurrentSpan` for contextual IDs
- [ ] Use `Effect.log` with structured data — never `console.log`

### Schema & Types

- [ ] Brand all entity IDs: `Schema.UUID.pipe(Schema.brand("@App/EntityId"))`
- [ ] Use `Option<T>` for nullable domain types — never `null`/`undefined`
- [ ] Handle Options with `Option.match` (both cases) — never `Option.getOrThrow`

### Layers

- [ ] `dependencies:` in service for dependency chains
- [ ] `Layer.mergeAll` at app root for sibling layers
- [ ] Use `Config.*` with validation — never `process.env` directly

### Atoms (Frontend)

- [ ] Define atoms OUTSIDE components; `Atom.keepAlive` for global state
- [ ] `useAtomSet` in React components — never `Atom.update` imperatively
- [ ] `get.addFinalizer()` for side-effect cleanup
- [ ] `Result.builder` with `onErrorTag` for rendering — never ignore loading/error states

### Forbidden Patterns

- [ ] No `runSync`/`runPromise` inside services
- [ ] No `throw` inside `Effect.gen` — use `Effect.fail`
- [ ] No `catchAll` losing type info
- [ ] No `console.log` — use `Effect.log`
- [ ] No `process.env` — use `Config.*`
- [ ] No `null` in domain types — use `Option`

## Sub-Rules

- `expect://rules/effect/anti-patterns`
- `expect://rules/effect/effect-atom-patterns`
- `expect://rules/effect/error-patterns`
- `expect://rules/effect/layer-patterns`
- `expect://rules/effect/observability-patterns`
- `expect://rules/effect/rpc-cluster-patterns`
- `expect://rules/effect/schema-patterns`
- `expect://rules/effect/service-patterns`
