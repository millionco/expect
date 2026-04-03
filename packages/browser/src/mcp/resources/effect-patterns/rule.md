---
name: effect-portable-patterns
description: Portable Effect patterns for robust promise execution. Use when wrapping async operations with timeouts, retries, tagged errors, caching, concurrency, pattern matching, or tracing - all designed to resolve to a plain Promise via Effect.runPromise.
version: 1.0.0
---

# Effect as a Portable Promise Utility

Self-contained effects (no services, no layers) that resolve to `Promise` via `Effect.runPromise`.

## Checklist

### Core Pattern

- [ ] Use `Effect.tryPromise` to wrap async — never `Effect.promise` (swallows errors)
- [ ] Use `Effect.fn("name")` for every function — never anonymous generators
- [ ] Run `Effect.runPromise` at the outermost boundary — never inside effect functions

### Errors

- [ ] Use `Data.TaggedError` with `_tag` for every distinct failure
- [ ] Catch by tag: `catchTag`/`catchTags` — never `catchAll` (loses type narrowing)
- [ ] Use `orElse`/`orElseSucceed` for fallbacks — never nested try/catch

### Timeouts

- [ ] External calls always have `Effect.timeout` or `Effect.timeoutFail`
- [ ] Use `timeoutFail` for custom error types; `timeoutTo` for fallback values

### Retries

- [ ] `Effect.retry({ times: N })` for fixed count
- [ ] `Schedule.exponential` for backoff; `while:` to retry specific errors only
- [ ] `Effect.retryOrElse` for fallback on retry exhaustion

### Caching

- [ ] `Effect.cachedWithTTL` for time-based caching
- [ ] `Effect.cachedFunction` for memoizing by arguments
- [ ] `Effect.cachedInvalidateWithTTL` for manual invalidation

### Concurrency

- [ ] `Effect.all` with `{ concurrency: N }` — not manual `Promise.all` chunking
- [ ] `Effect.forEach` with `concurrency` for parallel iteration
- [ ] `Effect.race`/`Effect.raceAll` for first-to-succeed

### Pattern Matching

- [ ] `Match.value` / `Match.type` with `Match.tag` — not switch on `_tag`
- [ ] `Match.exhaustive` for compile-time completeness

### Tracing

- [ ] `Effect.withSpan` for sub-spans; `Effect.annotateCurrentSpan` for metadata
- [ ] `Effect.log` for structured logging — never `console.log`/`console.time`

### Rules

- [ ] Keep effects self-contained: `R = never` (no services/layers)
- [ ] Every distinct failure gets its own tagged error class
- [ ] Timeout all external calls
