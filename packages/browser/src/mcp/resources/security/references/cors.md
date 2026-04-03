# CORS Misconfiguration

Cross-Origin Resource Sharing misconfigurations that expose APIs to unauthorized origins.

## How CORS Works

Browsers block cross-origin requests by default (same-origin policy). CORS headers tell the browser which origins are allowed to make requests and read responses. Misconfigurations can allow attackers to read sensitive data from a user's authenticated session.

## Vulnerable Patterns

### Reflecting Any Origin

```javascript
// VULNERABLE: echoes whatever origin the request sends
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
});
// Any site can make authenticated requests and read the response
```

### Wildcard with Credentials

```javascript
// INVALID (browsers reject this, but shows intent is wrong)
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Credentials", "true");

// The developer likely wanted to allow any origin with cookies,
// which means the real fix is wrong too (reflecting origin, see above)
```

### Regex Origin Validation Bypass

```javascript
// VULNERABLE: regex that can be bypassed
const allowedOriginPattern = /example\.com$/;
if (allowedOriginPattern.test(origin)) {
  res.setHeader("Access-Control-Allow-Origin", origin);
}
// Bypassed by: evil-example.com, attackerexample.com
```

### Null Origin

```javascript
// VULNERABLE: allowing null origin
if (origin === "null" || allowedOrigins.includes(origin)) {
  res.setHeader("Access-Control-Allow-Origin", origin);
}
// Sandboxed iframes and data: URIs send Origin: null
```

## Safe Patterns

### Explicit Origin Allowlist

```javascript
const ALLOWED_ORIGINS = new Set(["https://app.example.com", "https://admin.example.com"]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  next();
});
```

### Wildcard for Public APIs

```javascript
// SAFE: wildcard is fine for truly public APIs with no credentials
res.setHeader("Access-Control-Allow-Origin", "*");
// Do NOT combine with Access-Control-Allow-Credentials: true
```

### Framework CORS Configuration

```javascript
// Express cors middleware
import cors from "cors";

app.use(
  cors({
    origin: ["https://app.example.com"],
    credentials: true,
  }),
);
```

## Key Rules

| Configuration                                      | Risk     |
| -------------------------------------------------- | -------- |
| Reflect any origin + credentials                   | Critical |
| Regex origin match without anchoring               | High     |
| Allow null origin + credentials                    | High     |
| Wildcard without credentials (public API)          | Safe     |
| Explicit allowlist + credentials                   | Safe     |
| Missing Vary: Origin header when reflecting origin | Medium   |

## Verification Checklist

1. Does the API reflect the request's `Origin` header into `Access-Control-Allow-Origin`?
2. Is `Access-Control-Allow-Credentials: true` combined with a dynamic or wildcard origin?
3. Is origin validation using regex properly anchored (exact match, not suffix)?
4. Is `null` accepted as a valid origin?
5. Is `Vary: Origin` set when the `Access-Control-Allow-Origin` value changes per request?
6. For public APIs: is `Access-Control-Allow-Credentials` omitted when using wildcard origin?
