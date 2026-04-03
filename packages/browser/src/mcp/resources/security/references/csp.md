# Content Security Policy (CSP)

Mitigating XSS and data injection attacks via browser-enforced content restrictions.

## What CSP Does

CSP tells the browser which sources of content (scripts, styles, images, fonts, etc.) are allowed to load and execute. It acts as a second line of defense: even if an attacker injects a script tag, the browser blocks execution if the source is not allowed by the policy.

CSP does NOT replace proper input sanitization and output encoding. It is defense-in-depth.

## Key Directives

| Directive         | Controls                           | Recommended Value            |
| ----------------- | ---------------------------------- | ---------------------------- |
| `default-src`     | Fallback for all resource types    | `'self'`                     |
| `script-src`      | JavaScript execution               | `'self'` + nonce/hash        |
| `style-src`       | CSS loading                        | `'self' 'unsafe-inline'`     |
| `img-src`         | Image sources                      | `'self' data: https:`        |
| `connect-src`     | Fetch, XHR, WebSocket destinations | `'self'` + API origins       |
| `frame-src`       | iframe sources                     | `'none'` or specific origins |
| `frame-ancestors` | Who can embed this page in iframe  | `'none'` or `'self'`         |
| `form-action`     | Form submission targets            | `'self'`                     |
| `base-uri`        | Allowed `<base>` tag values        | `'self'`                     |
| `object-src`      | Plugin content (Flash, Java)       | `'none'`                     |

## Vulnerable Patterns

### Overly Permissive Policy

```
// VULNERABLE: allows inline scripts (defeats most XSS protection)
Content-Security-Policy: script-src 'self' 'unsafe-inline'

// VULNERABLE: allows eval (code injection risk)
Content-Security-Policy: script-src 'self' 'unsafe-eval'

// VULNERABLE: wildcard allows any source
Content-Security-Policy: script-src *

// VULNERABLE: allows any HTTPS source
Content-Security-Policy: script-src https:
```

### Missing Directives

```
// VULNERABLE: no frame-ancestors (clickjacking risk)
Content-Security-Policy: default-src 'self'

// SHOULD BE:
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
```

### Common Bypasses

```
// VULNERABLE: allowing CDNs that host user content
Content-Security-Policy: script-src 'self' https://cdn.jsdelivr.net
// Attacker can host malicious JS on jsdelivr

// VULNERABLE: JSONP endpoints on allowed origins
Content-Security-Policy: script-src 'self' https://accounts.google.com
// If google has a JSONP endpoint, it can be abused
```

## Safe Patterns

### Nonce-Based CSP

```javascript
// Server generates a unique nonce per request
const nonce = crypto.randomBytes(16).toString("base64");

// Set in the CSP header
res.setHeader(
  "Content-Security-Policy",
  `script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; default-src 'self'`,
);

// Include the nonce on legitimate script tags
// <script nonce="${nonce}">...</script>
```

### Next.js CSP

```javascript
// next.config.js
const cspHeader = `
  default-src 'self';
  script-src 'self' 'nonce-{nonce}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' ${apiOrigin};
  frame-ancestors 'none';
  form-action 'self';
  base-uri 'self';
  object-src 'none';
`;
```

### Report-Only Mode

```
// Use report-only to test a policy before enforcing it
Content-Security-Policy-Report-Only: default-src 'self'; report-uri /csp-report
```

## Severity Context

CSP issues are defense-in-depth. A missing or weak CSP alone is typically Medium severity. It becomes High when combined with an existing XSS vulnerability that the CSP would have mitigated.

## Verification Checklist

1. Is a CSP header set on the application?
2. Does `script-src` avoid `'unsafe-inline'` and `'unsafe-eval'`?
3. Is `frame-ancestors` set to prevent clickjacking?
4. Are CDN allowlists as narrow as possible (avoid wildcard CDN origins)?
5. Is `object-src` set to `'none'`?
6. For SPAs: does `connect-src` restrict API origins?
