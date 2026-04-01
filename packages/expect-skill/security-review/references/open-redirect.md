# Open Redirect

Redirecting users to attacker-controlled URLs.

## How Open Redirects Work

1. Application accepts a URL parameter for redirect (e.g., `?next=/dashboard`)
2. Attacker crafts a link with an external URL: `?next=https://evil.com`
3. User clicks the link, trusting the domain
4. Application redirects user to the attacker's site
5. Attacker phishes credentials or serves malware

## Vulnerable Patterns

### Client-Side Redirects

```javascript
// VULNERABLE: unvalidated redirect from URL params
const next = new URLSearchParams(location.search).get("next")
window.location = next

// VULNERABLE: unvalidated redirect from hash
window.location.href = location.hash.slice(1)

// VULNERABLE: window.open with user-controlled URL
window.open(params.get("url"))

// VULNERABLE: anchor href from user input
const link = document.createElement("a")
link.href = userInput
```

### React/Next.js Redirects

```jsx
// VULNERABLE: redirect to user-controlled URL
import { redirect } from "next/navigation"

export default function Page({ searchParams }) {
  if (!session) {
    redirect(searchParams.next)  // attacker controls destination
  }
}

// VULNERABLE: Link component with user-controlled href
<Link href={userInput}>Click here</Link>

// VULNERABLE: router.push with user-controlled path
router.push(searchParams.get("redirect"))
```

## Safe Patterns

### Allowlist Validation

```javascript
// SAFE: validate against known paths
const ALLOWED_PATHS = ["/dashboard", "/settings", "/profile"]
const next = params.get("next")
const destination = ALLOWED_PATHS.includes(next) ? next : "/dashboard"
window.location = destination
```

### Relative Path Validation

```javascript
// SAFE: only allow relative paths, block protocol-relative URLs
const isRelativePath = (url) => {
  return url.startsWith("/") && !url.startsWith("//")
}

const next = params.get("next")
window.location = isRelativePath(next) ? next : "/dashboard"
```

### Origin Validation

```javascript
// SAFE: parse and validate the origin
const validateRedirect = (url, allowedOrigins) => {
  try {
    const parsed = new URL(url, window.location.origin)
    return allowedOrigins.includes(parsed.origin) ? url : "/"
  } catch {
    return "/"
  }
}

const next = params.get("next")
window.location = validateRedirect(next, ["https://example.com"])
```

## Bypass Techniques to Watch For

These bypasses can defeat naive validation:

| Input                             | Bypasses                         |
| --------------------------------- | -------------------------------- |
| `//evil.com`                     | Protocol-relative URL            |
| `https://evil.com`               | Absolute URL                     |
| `/\evil.com`                     | Backslash treated as path sep    |
| `https://example.com@evil.com`   | Userinfo in URL                  |
| `javascript:alert(1)`           | JavaScript protocol in href      |
| `data:text/html,...`            | Data URI                         |
| `%2f%2fevil.com`                | URL-encoded protocol-relative    |

## Verification Checklist

1. Is any redirect destination derived from user input (query params, hash, postMessage)?
2. Is the redirect URL validated against an allowlist of paths or origins?
3. Are protocol-relative URLs (`//evil.com`) blocked?
4. Are `javascript:` and `data:` protocols blocked in href attributes?
5. Is `window.open()` called with user-controlled URLs?
