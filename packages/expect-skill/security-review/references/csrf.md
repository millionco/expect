# Cross-Site Request Forgery (CSRF)

Forcing authenticated users to perform unintended actions.

## How CSRF Works

1. User is logged into `example.com` with a session cookie
2. User visits `evil.com`
3. `evil.com` triggers a request to `example.com` (form submission, image tag, fetch)
4. Browser attaches the user's cookies automatically
5. `example.com` processes the request as if the user intended it

## When CSRF Matters

CSRF is only relevant for requests that:

- Mutate state (POST, PUT, DELETE, PATCH)
- Use cookie-based authentication (session cookies)
- Can be triggered cross-origin (form submissions, simple requests)

CSRF is NOT relevant when:

- The API uses token-based auth (Bearer tokens in headers)
- The request requires a custom header that triggers CORS preflight
- The endpoint is read-only (GET requests that don't mutate)
- SameSite=Strict or SameSite=Lax cookies are used correctly

## Vulnerable Patterns

```javascript
// VULNERABLE: state mutation via GET (never do this)
app.get("/api/delete-account", (req, res) => {
  deleteAccount(req.user.id)
})

// VULNERABLE: POST without CSRF token, using cookie auth
app.post("/api/transfer", (req, res) => {
  transfer(req.user.id, req.body.to, req.body.amount)
})
// Attacker can submit a form from evil.com targeting this endpoint

// VULNERABLE: fetch with credentials but no CSRF protection
fetch("/api/settings", {
  method: "POST",
  credentials: "include",
  body: JSON.stringify(data),
})
```

## Safe Patterns

### CSRF Tokens

```javascript
// Server generates a token per session
const csrfToken = crypto.randomBytes(32).toString("hex")
req.session.csrfToken = csrfToken

// Client includes the token in requests
fetch("/api/settings", {
  method: "POST",
  headers: {
    "X-CSRF-Token": csrfToken,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(data),
})

// Server verifies the token
if (req.headers["x-csrf-token"] !== req.session.csrfToken) {
  return res.status(403).json({ error: "Invalid CSRF token" })
}
```

### SameSite Cookies

```javascript
// SameSite=Lax prevents most CSRF (default in modern browsers)
res.cookie("session", token, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
})

// SameSite=Strict prevents all cross-site cookie sending
// but breaks legitimate cross-site navigation
res.cookie("session", token, {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
})
```

### Custom Headers

```javascript
// Custom headers trigger CORS preflight, blocking cross-origin simple requests
fetch("/api/data", {
  method: "POST",
  headers: {
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(data),
})
```

## Framework Protections

| Framework   | Built-in CSRF Protection                        |
| ----------- | ----------------------------------------------- |
| Next.js     | Server Actions include CSRF protection          |
| Django      | `{% csrf_token %}` in forms, `@csrf_protect`    |
| Express     | Use `csurf` middleware or custom token           |
| Rails       | `protect_from_forgery` enabled by default        |

## Verification Checklist

1. Do state-mutating endpoints (POST/PUT/DELETE) require a CSRF token?
2. Are session cookies set with `SameSite=Lax` or `SameSite=Strict`?
3. Are any GET endpoints performing state mutations?
4. Is the API using cookie-based auth without CSRF protection?
5. For SPAs using Bearer tokens: CSRF protection is not needed (tokens are not auto-sent)
