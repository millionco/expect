---
name: security-review
description: >
  Systematic browser security code review identifying high-confidence vulnerabilities with
  data-flow verification. Use when reviewing frontend code for XSS, CSRF, open redirects,
  postMessage, cookie security, CSP, CORS, prototype pollution, or client-side storage issues.
  Focused on JavaScript/TypeScript and modern frameworks (React, Vue, Next.js).
version: 1.0.0
license: MIT
---

# Security Review

Identify exploitable browser security vulnerabilities in code. Report only HIGH CONFIDENCE findings with confirmed attacker-controlled input reaching a dangerous sink.

## Scope: Research vs. Reporting

**Report on:** Only the specific file, diff, or code provided by the user.
**Research:** The ENTIRE codebase to build confidence before reporting.

Before flagging any issue, research the codebase to understand:

- Where does this input actually come from? (trace data flow)
- Is there sanitization elsewhere? (DOMPurify, allowlists, encoding)
- What framework protections exist? (auto-escaping, CSP, CSRF tokens)

Do NOT report issues based solely on pattern matching. Investigate first, report only what you're confident is exploitable.

## Confidence Levels

| Level  | Criteria                                                 | Action                       |
| ------ | -------------------------------------------------------- | ---------------------------- |
| HIGH   | Vulnerable pattern + attacker-controlled input confirmed | Report with severity         |
| MEDIUM | Vulnerable pattern, input source unclear                 | Note as "Needs verification" |
| LOW    | Theoretical, best practice, defense-in-depth             | Do not report                |

## Do Not Flag

### General Rules

- Test files (unless explicitly reviewing test security)
- Dead code, commented code, documentation strings
- Patterns using constants or server-controlled configuration
- Code paths behind authentication (note the auth requirement instead)

### Server-Controlled Values (NOT Attacker-Controlled)

| Source                | Example                             | Why It's Safe              |
| --------------------- | ----------------------------------- | -------------------------- |
| Environment variables | `process.env.API_URL`               | Deployment configuration   |
| Config files          | `config.yaml`, `app.config['KEY']`  | Server-side files          |
| Framework settings    | `next.config.js` values             | Not user-modifiable        |
| Hardcoded values      | `BASE_URL = "https://api.example"`  | Compile-time constants     |
| Effect Config         | `Config.string("API_KEY")`          | Validated deployment config |

### Framework-Mitigated Patterns

Check `references/xss.md` before flagging. Common false positives:

| Pattern                            | Why It's Usually Safe           |
| ---------------------------------- | ------------------------------- |
| React `{variable}`                | Auto-escaped by default          |
| Vue `{{ variable }}`              | Auto-escaped by default          |
| `innerHTML = "<b>Loading...</b>"` | Constant string, no user input   |
| Next.js API routes with body parsing | Framework handles parsing     |

Only flag these when:

- React: `dangerouslySetInnerHTML={{__html: userInput}}`
- Vue: `v-html="userInput"`
- Any framework: `innerHTML`, `outerHTML`, `document.write()` with user input

## Review Process

### 1. Detect Context

| Code Type                        | Load Reference                      |
| -------------------------------- | ----------------------------------- |
| JSX, templates, DOM manipulation | `references/xss.md`                |
| Form submissions, state mutations | `references/csrf.md`              |
| Redirects, link hrefs            | `references/open-redirect.md`      |
| `postMessage`, `addEventListener("message")` | `references/postmessage.md` |
| Cookies, `Set-Cookie`, auth tokens | `references/cookies.md`          |
| CSP headers, meta tags           | `references/csp.md`               |
| CORS headers, fetch credentials  | `references/cors.md`              |
| localStorage, sessionStorage     | `references/client-storage.md`    |
| Object merging, query parsing    | `references/prototype-pollution.md` |
| Next.js App Router, RSC, Server Actions | `references/nextjs-react.md` |

### 2. Research Before Flagging

For each potential issue:

1. Where does this value actually come from? Trace the data flow.
2. Is there sanitization, encoding, or allowlisting before it reaches the sink?
3. Does the framework auto-escape or auto-encode at this point?
4. Is the vulnerable code reachable with attacker-controlled input?

### 3. Verify Exploitability

**Is the input attacker-controlled?**

| Attacker-Controlled (Investigate)       | Server-Controlled (Usually Safe)   |
| --------------------------------------- | ---------------------------------- |
| `location.hash`, `location.search`     | Hardcoded constants                |
| `document.referrer`                     | Build-time env vars                |
| `window.name`                          | Config from server (not user-set)  |
| `postMessage` data (from any origin)   | Signed/httpOnly cookies            |
| URL path segments                      | Server-rendered static content     |
| `localStorage` written by other code   | Framework settings                 |
| User-generated content from DB          |                                    |
| File upload names and content           |                                    |

### 4. Report HIGH Confidence Only

Skip theoretical issues. Report only what you've confirmed is exploitable after research.

## Severity Classification

| Severity | Impact                                 | Examples                                                     |
| -------- | -------------------------------------- | ------------------------------------------------------------ |
| Critical | Direct exploit, no auth required       | Stored XSS, account takeover via cookie theft, auth bypass   |
| High     | Exploitable with conditions            | Reflected XSS, CSRF on sensitive actions, open redirect to phishing |
| Medium   | Specific conditions required           | Self-XSS, CORS misconfiguration, missing CSP                |
| Low      | Defense-in-depth, minimal direct impact | Missing security headers, verbose client errors              |

## Quick Patterns Reference

### Always Flag (Critical)

```javascript
eval(userInput)
new Function(userInput)
setTimeout(userInput, 0)              // string form
setInterval(userInput, 0)             // string form
document.write(userInput)
element.innerHTML = userInput
element.outerHTML = userInput
```

### Always Flag (High)

```jsx
// React XSS
<div dangerouslySetInnerHTML={{__html: userInput}} />

// Vue XSS
<div v-html="userInput" />

// jQuery XSS
$(element).html(userInput)
$("<div>" + userInput + "</div>")

// Open redirect
window.location = userInput
window.location.href = userInput
window.open(userInput)

// Unsafe postMessage
window.parent.postMessage(sensitiveData, "*")
```

### Always Flag (Secrets)

```javascript
const apiKey = "sk-..."
const secret = "hardcoded-secret-value"
const token = "eyJhbGci..."                // hardcoded JWT
```

### Check Context First (MUST Investigate)

```javascript
// XSS: ONLY if the value is user-controlled
element.innerHTML = serverRenderedConstant   // SAFE
element.innerHTML = sanitizedHtml            // CHECK: how is it sanitized?
element.innerHTML = userInput                // FLAG

// Redirect: ONLY if URL is user-controlled
window.location = "/dashboard"               // SAFE: hardcoded path
window.location = config.loginUrl            // SAFE: server config
window.location = params.get("next")         // FLAG: user-controlled

// postMessage: ONLY if origin is not checked
window.addEventListener("message", (event) => {
  if (event.origin !== expectedOrigin) return  // SAFE: origin validated
  processData(event.data)
})
window.addEventListener("message", (event) => {
  processData(event.data)                      // FLAG: no origin check
})

// Crypto: ONLY if used for security
Math.random()                                 // SAFE: UI animations
Math.random() for token generation            // FLAG: use crypto.randomUUID()
```

## Output Format

```markdown
## Security Review: [File/Component Name]

### Summary
- **Findings**: X (Y Critical, Z High, ...)
- **Risk Level**: Critical/High/Medium/Low
- **Confidence**: High/Mixed

### Findings

#### [VULN-001] [Vulnerability Type] (Severity)
- **Location**: `file.ts:123`
- **Confidence**: High
- **Issue**: [What the vulnerability is]
- **Impact**: [What an attacker could do]
- **Evidence**: [Vulnerable code snippet]
- **Fix**: [How to remediate]

### Needs Verification

#### [VERIFY-001] [Potential Issue]
- **Location**: `file.ts:456`
- **Question**: [What needs to be verified]
```

If no vulnerabilities found, state: "No high-confidence vulnerabilities identified."

## A Note on TLS

Most development work runs without TLS or behind a TLS proxy. Do not flag lack of TLS as a security issue. Be careful around "secure" cookies: they should only be set when the application runs over TLS. Avoid recommending HSTS without understanding the deployment context.

## Red Flags

If you catch yourself thinking any of these, stop and reconsider:

| You Think                                        | The Rule                                                     |
| ------------------------------------------------ | ------------------------------------------------------------ |
| "This uses innerHTML but the input looks safe"  | Trace the data flow. If any user path reaches it, flag it.   |
| "The framework probably handles this"            | Verify. Check the reference guide. Don't assume.             |
| "I'll flag this env var as an XSS source"        | Server config is not attacker-controlled.                    |
| "postMessage is always unsafe"                   | Only if origin is not validated or data is used unsafely.    |
| "Missing CSP is critical"                        | CSP is defense-in-depth. Rate it Medium, not Critical.       |
| "I'll report everything to be thorough"          | LOW confidence findings waste developer time. Skip them.     |
