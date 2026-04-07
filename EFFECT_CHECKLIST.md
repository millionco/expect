

1. does your changes introduce new schemas / types? -> are you 100% SURE there are NO EXISTING SCHEMAS that cover what you're trying to do?

2. does your code have `Effect.catch`, `Effect.catchTag("UnrecoverableError", ...)`? you should ALMOST ALWAYS let errors bubble up.
  - if your error is a fatal error (it cant be recovered from) -> `Effect.catchTag("UnrecoverableError", Effect.die)`
  - if your error is a recoverable error -> let it bubble up.

3. is ALL YOUR EFFECT CODE inside a `ServiceMap`? if not -> put it inside a `ServiceMap`. design your code with a service first approach, first design the service, then implement it, don't just write one function at a time as you explore the problem space
