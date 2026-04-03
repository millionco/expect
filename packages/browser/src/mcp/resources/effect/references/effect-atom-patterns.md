# Effect Atom Patterns

Effect Atom is a reactive state management library that integrates with Effect-TS. It provides atoms (reactive containers), automatic dependency tracking, and seamless React integration.

## Core Concepts

- **Atoms**: Reactive state containers with automatic dependency tracking
- **Result**: Handles async/effectful computations with initial, success, and failure states
- **Finalizers**: Built-in cleanup for resources and event listeners
- **Families**: Dynamic atom creation for per-entity state

## Creating Atoms

### Basic Atoms

```typescript
import { Atom } from "@effect-atom/atom-react";

// Simple value atom
const countAtom = Atom.make(0);

// With keepAlive - persists when no components subscribe
const persistentCountAtom = Atom.make(0).pipe(Atom.keepAlive);
```

**Rule:** Use `Atom.keepAlive` for global state that should persist across component unmounts.

### Derived Atoms

```typescript
const countAtom = Atom.make(0);

// Derived using get function
const doubleCountAtom = Atom.make((get) => get(countAtom) * 2);

// Derived using Atom.map
const tripleCountAtom = Atom.map(countAtom, (count) => count * 3);
```

### Atoms with Side Effects

```typescript
// Track window scroll position
const scrollYAtom = Atom.make((get) => {
  const onScroll = () => get.setSelf(window.scrollY);

  window.addEventListener("scroll", onScroll);
  get.addFinalizer(() => window.removeEventListener("scroll", onScroll));

  return window.scrollY;
}).pipe(Atom.keepAlive);
```

**Critical:**

- Use `get.setSelf` to update the atom's own value
- Always add finalizers with `get.addFinalizer()` to clean up side effects
- Finalizers run when the atom is rebuilt or disposed

### Atom.transform for Self-Updating Derived State

```typescript
const resolvedThemeAtom = Atom.transform(themeAtom, (get) => {
  const theme = get(themeAtom);
  if (theme !== "system") return theme;

  const matcher = window.matchMedia("(prefers-color-scheme: dark)");

  const onChange = () => get.setSelf(matcher.matches ? "dark" : "light");

  matcher.addEventListener("change", onChange);
  get.addFinalizer(() => matcher.removeEventListener("change", onChange));

  return matcher.matches ? "dark" : "light";
});
```

## Atom Families

Use `Atom.family` for per-entity state:

```typescript
import { Atom } from "@effect-atom/atom-react";

// Create a family of atoms - one per channelId
const replyToMessageAtomFamily = Atom.family((channelId: string) =>
  Atom.make<string | null>(null).pipe(Atom.keepAlive),
);

// Modal state family
type ModalType = "settings" | "confirm" | "create";

interface ModalState {
  type: ModalType;
  isOpen: boolean;
  metadata?: Record<string, unknown>;
}

const modalAtomFamily = Atom.family((type: ModalType) =>
  Atom.make<ModalState>({
    type,
    isOpen: false,
    metadata: undefined,
  }).pipe(Atom.keepAlive),
);
```

**Use families for:**

- Per-resource state (users, channels, documents)
- Modal instances
- Form state per entity
- Any parameterized state

## React Integration

### Reading Atom Values

```typescript
import { useAtomValue } from "@effect-atom/atom-react"

function Counter() {
    const count = useAtomValue(countAtom)
    return <span>{count}</span>
}
```

### Updating Atom Values

```typescript
import { useAtomSet } from "@effect-atom/atom-react"

function IncrementButton() {
    const setCount = useAtomSet(countAtom)
    return (
        <button onClick={() => setCount((c) => c + 1)}>
            Increment
        </button>
    )
}
```

### Reading and Writing Together

```typescript
import { useAtom } from "@effect-atom/atom-react"

function CounterControl() {
    const [count, setCount] = useAtom(countAtom)
    return (
        <div>
            <span>{count}</span>
            <button onClick={() => setCount(count + 1)}>+1</button>
        </div>
    )
}
```

### Mounting Side-Effect Atoms

Use `useAtomMount` to activate atoms without reading their value:

```typescript
import { useAtomMount } from "@effect-atom/atom-react"

function App() {
    // Activate side effects without subscribing to value
    useAtomMount(keyboardShortcutsAtom)
    useAtomMount(presenceTrackingAtom)
    useAtomMount(themeApplierAtom)

    return <>{children}</>
}
```

## Working with Effects and Results

### Effectful Atoms Return Result

```typescript
import { Atom, Result } from "@effect-atom/atom-react";
import { Effect } from "effect";

const userAtom = Atom.make(
  Effect.gen(function* () {
    const response = yield* fetchUser();
    return response;
  }),
); // Type: Atom<Result<User, Error>>
```

### Handling Results with Result.builder (Recommended)

**Use `Result.builder`** for rendering Result types. It provides a chainable API with granular error handling and type narrowing.

```typescript
import { Result, useAtomValue } from "@effect-atom/atom-react"

function UserProfile() {
    const userResult = useAtomValue(userAtom)

    return Result.builder(userResult)
        .onInitial(() => <div>Loading...</div>)
        .onError((error) => <div>Error: {error.message}</div>)
        .onSuccess((user) => <div>Hello, {user.name}!</div>)
        .render()
}
```

### Result.builder with Tagged Errors

**Key advantage**: Handle specific error types with `onErrorTag`:

```typescript
function ResourceEmbed({ url }: { url: string }) {
    const resourceResult = useAtomValue(resourceAtom)

    return Result.builder(resourceResult)
        .onInitial(() => <Skeleton />)
        .onErrorTag("NotFoundError", (error) => (
            <ErrorCard message={error.message} />
        ))
        .onErrorTag("UnauthorizedError", () => (
            <ConnectPrompt provider="GitHub" />
        ))
        .onErrorTag("RateLimitError", (error) => (
            <RetryCard retryAfter={error.retryAfter} />
        ))
        .onError((error) => (
            // Fallback for any other errors
            <ErrorCard message="Something went wrong" />
        ))
        .onSuccess((data) => <ResourceCard data={data} />)
        .render()
}
```

### Result.builder Methods

| Method                     | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `onInitial(fn)`            | Handle initial/loading state                     |
| `onInitialOrWaiting(fn)`   | Handle both initial and waiting states           |
| `onWaiting(fn)`            | Handle waiting/refetching state                  |
| `onSuccess(fn)`            | Handle success with value                        |
| `onError(fn)`              | Handle any error                                 |
| `onErrorTag(tag, fn)`      | Handle specific tagged error (removes from type) |
| `onErrorIf(predicate, fn)` | Handle errors matching predicate                 |
| `onFailure(fn)`            | Handle failure with full Cause                   |
| `onDefect(fn)`             | Handle unexpected defects                        |
| `render()`                 | Return result (null if unhandled initial)        |
| `orElse(fn)`               | Provide fallback value                           |
| `orNull()`                 | Return null for unhandled cases                  |

### Extracting Values with orElse

For non-rendering use cases, extract values with `orElse`:

```typescript
function useRepositories() {
  const reposResult = useAtomValue(repositoriesAtom);

  // Extract array or empty fallback
  const repositories = Result.builder(reposResult)
    .onSuccess((data) => data.repositories)
    .orElse(() => []);

  return repositories;
}
```

### Result.getOrElse for Simple Extraction

For simple value extraction without error handling:

```typescript
function UserName() {
    const userResult = useAtomValue(userAtom)
    const user = Result.getOrElse(userResult, () => null)

    if (!user) return <span>Loading...</span>
    return <span>{user.name}</span>
}
```

### When to Use Each Pattern

| Pattern                       | Use Case                               |
| ----------------------------- | -------------------------------------- |
| `Result.builder`              | UI rendering with multiple error types |
| `Result.builder + onErrorTag` | APIs with tagged errors (HttpApi, RPC) |
| `Result.builder + orElse`     | Extracting values with fallback        |
| `Result.getOrElse`            | Simple value extraction                |
| `Result.match`                | Simple 3-case exhaustive matching      |

### Accessing Results in Derived Atoms

```typescript
const userProfileAtom = Atom.make(
  Effect.fnUntraced(function* (get: Atom.Context) {
    // Unwrap Result to get the value (waits for success)
    const user = yield* get.result(userAtom);
    const posts = yield* fetchUserPosts(user.id);
    return { user, posts };
  }),
);
```

## Batching Updates

Use `Atom.batch` for multiple updates:

```typescript
const openModal = (type: ModalType, metadata?: Record<string, unknown>) => {
  Atom.batch(() => {
    Atom.update(modalAtomFamily(type), (state) => ({
      ...state,
      isOpen: true,
      metadata,
    }));
  });
};
```

## localStorage Persistence

```typescript
import { BrowserKeyValueStore } from "@effect/platform-browser";
import { Atom } from "@effect-atom/atom-react";
import { Schema } from "effect";

// Create runtime with localStorage
const localStorageRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage);

// Persisted atom with schema validation
const themeAtom = Atom.kvs({
  runtime: localStorageRuntime,
  key: "app-theme",
  schema: Schema.Literal("dark", "light", "system"),
  defaultValue: () => "system" as const,
});
```

## Anti-Patterns

### FORBIDDEN: Creating Atoms Inside Components

```typescript
// WRONG - creates new atom on every render
function Counter() {
    const countAtom = Atom.make(0) // New atom each render!
    const count = useAtomValue(countAtom)
    return <div>{count}</div>
}

// CORRECT - define atoms outside components
const countAtom = Atom.make(0)

function Counter() {
    const count = useAtomValue(countAtom)
    return <div>{count}</div>
}
```

### FORBIDDEN: Imperative Updates from React Components

```typescript
// WRONG - doesn't trigger React re-renders
export const openModal = (type: string) => {
    Atom.batch(() => {
        Atom.update(modalAtomFamily(type), (s) => ({ ...s, isOpen: true }))
    })
}

function Component() {
    return <button onClick={() => openModal("settings")}>Open</button>
}

// CORRECT - use hooks for React integration
export const useModal = (type: string) => {
    const state = useAtomValue(modalAtomFamily(type))
    const setState = useAtomSet(modalAtomFamily(type))

    const open = useCallback(() => {
        setState((prev) => ({ ...prev, isOpen: true }))
    }, [setState])

    const close = useCallback(() => {
        setState((prev) => ({ ...prev, isOpen: false }))
    }, [setState])

    return { isOpen: state.isOpen, open, close }
}
```

**When imperative updates ARE acceptable:**

- Event listeners outside React (keyboard shortcuts)
- Effects running on atom changes
- Non-UI state (analytics, logging)

### FORBIDDEN: Missing Finalizers

```typescript
// WRONG - memory leak!
const scrollAtom = Atom.make((get) => {
  const onScroll = () => get.setSelf(window.scrollY);
  window.addEventListener("scroll", onScroll);
  return window.scrollY;
});

// CORRECT - cleanup registered
const scrollAtom = Atom.make((get) => {
  const onScroll = () => get.setSelf(window.scrollY);
  window.addEventListener("scroll", onScroll);
  get.addFinalizer(() => window.removeEventListener("scroll", onScroll));
  return window.scrollY;
});
```

### FORBIDDEN: Missing keepAlive for Global State

```typescript
// WRONG - state resets when component unmounts
export const modalStateAtom = Atom.make({ isOpen: false });

// CORRECT - state persists
export const modalStateAtom = Atom.make({ isOpen: false }).pipe(Atom.keepAlive);
```

### FORBIDDEN: Ignoring Result Types

```typescript
// WRONG - doesn't handle loading/error states
const userResult = useAtomValue(userAtom)
return <div>Hello, {userResult.name}</div> // Type error!

// CORRECT - use Result.builder to handle all states
const userResult = useAtomValue(userAtom)
return Result.builder(userResult)
    .onInitial(() => <div>Loading...</div>)
    .onError((error) => <div>Error: {error.message}</div>)
    .onSuccess((user) => <div>Hello, {user.name}</div>)
    .render()
```

### FORBIDDEN: Updating State During Render

```typescript
// WRONG - side effect during render
function Component() {
    const count = useAtomValue(countAtom)
    Atom.set(countAtom, count + 1) // Never do this!
    return <div>{count}</div>
}

// CORRECT - use effects or event handlers
function Component() {
    const count = useAtomValue(countAtom)
    const setCount = useAtomSet(countAtom)

    useEffect(() => {
        setCount((c) => c + 1)
    }, [])

    return <div>{count}</div>
}
```

## Performance Tips

### Selective Re-rendering

```typescript
// WRONG - subscribes to entire state
const state = useAtomValue(appStateAtom);
const userName = state.user.name;

// CORRECT - derive focused atom
const userNameAtom = Atom.map(appStateAtom, (state) => state.user.name);
const userName = useAtomValue(userNameAtom);
```

### When to Use keepAlive

Use `Atom.keepAlive` for:

- Global application state
- Modal/dialog state
- User preferences
- Authentication state
- Frequently accessed derived state

Skip `keepAlive` for:

- Component-local state that should reset
- Temporary form state
- State tied to component lifecycle
