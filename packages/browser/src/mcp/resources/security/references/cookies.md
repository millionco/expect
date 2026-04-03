# Cookie Security

Authentication cookies, session management, and cookie attribute vulnerabilities.

## Cookie Attributes

| Attribute  | Purpose                                          | When Required                         |
| ---------- | ------------------------------------------------ | ------------------------------------- |
| `HttpOnly` | Prevents JavaScript access via `document.cookie` | Always for session/auth cookies       |
| `Secure`   | Only sent over HTTPS                             | Production (skip for local dev)       |
| `SameSite` | Controls cross-site sending                      | Always for session cookies            |
| `Path`     | Restricts cookie to URL path                     | When cookie is path-specific          |
| `Domain`   | Controls which domains receive the cookie        | Omit to restrict to exact domain      |
| `Max-Age`  | Expiration in seconds                            | Session cookies should be short-lived |

## Vulnerable Patterns

### Missing HttpOnly

```javascript
// VULNERABLE: auth token accessible to JavaScript (XSS can steal it)
res.cookie("session", token);
res.cookie("authToken", jwt);
document.cookie = `session=${token}`;

// If XSS exists, attacker can read: document.cookie
// and exfiltrate the session token
```

### Missing SameSite

```javascript
// VULNERABLE: cookie sent on all cross-site requests (CSRF risk)
res.cookie("session", token, { httpOnly: true });
// Default SameSite varies by browser; be explicit
```

### Overly Broad Domain

```javascript
// VULNERABLE: cookie shared with all subdomains
res.cookie("session", token, {
  domain: ".example.com", // shared with any subdomain
  httpOnly: true,
});
// If any subdomain is compromised, session is compromised

// SAFE: omit domain to restrict to exact origin
res.cookie("session", token, { httpOnly: true });
```

### Sensitive Data in Cookies

```javascript
// VULNERABLE: PII or secrets in cookie values
res.cookie("user", JSON.stringify({ email, role, ssn }));
res.cookie("apiKey", secretKey);

// SAFE: store only an opaque session ID
res.cookie("sid", sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
});
```

## Safe Patterns

### Session Cookies

```javascript
// Production cookie settings
res.cookie("session", sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: "/",
});
```

### Development vs. Production

```javascript
// Adjust secure flag based on environment
const isProduction = process.env.NODE_ENV === "production";

res.cookie("session", sessionId, {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
});
```

### Token Storage Alternatives

```javascript
// For SPAs: prefer httpOnly cookies over localStorage for auth tokens
// localStorage is accessible to any JavaScript on the page (XSS risk)

// BAD: storing auth token in localStorage
localStorage.setItem("token", authToken);

// BETTER: httpOnly cookie set by the server
// The client never touches the token directly
```

## Client-Side Cookie Access

```javascript
// Reading cookies in JavaScript (only non-HttpOnly cookies)
const cookies = document.cookie.split(";").reduce((acc, cookie) => {
  const [key, value] = cookie.trim().split("=");
  acc[key] = value;
  return acc;
}, {});

// If you can read an auth cookie via document.cookie,
// it means HttpOnly is missing
```

## Verification Checklist

1. Do session/auth cookies have `HttpOnly` set?
2. Do session cookies have `SameSite=Lax` or `SameSite=Strict`?
3. Is `Secure` set in production (and conditionally skipped for local dev)?
4. Is the `Domain` attribute as narrow as possible (prefer omitting it)?
5. Are sensitive values (PII, API keys) stored in cookie values?
6. Are auth tokens stored in `localStorage` instead of httpOnly cookies?
7. Is `document.cookie` used to set or read auth-related cookies?
