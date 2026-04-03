# postMessage Security

Cross-origin messaging vulnerabilities in browser applications.

## How postMessage Works

`window.postMessage` enables cross-origin communication between windows (iframes, popups, parent frames). It bypasses the same-origin policy by design, which makes it a security-sensitive API.

## Vulnerable Patterns

### Missing Origin Validation

```javascript
// VULNERABLE: no origin check on incoming messages
window.addEventListener("message", (event) => {
  processData(event.data);
});

// VULNERABLE: origin check is present but wrong
window.addEventListener("message", (event) => {
  if (event.origin.includes("example.com")) {
    // Bypassed by: evil-example.com, example.com.evil.com
    processData(event.data);
  }
});

// VULNERABLE: origin compared with indexOf
window.addEventListener("message", (event) => {
  if (event.origin.indexOf("example.com") !== -1) {
    // Same bypass as above
    processData(event.data);
  }
});
```

### Wildcard Target Origin

```javascript
// VULNERABLE: sensitive data sent to any origin
iframe.contentWindow.postMessage(sensitiveData, "*");
window.parent.postMessage({ token: authToken }, "*");
window.opener.postMessage(userData, "*");
```

### DOM Manipulation from Message Data

```javascript
// VULNERABLE: XSS via postMessage
window.addEventListener("message", (event) => {
  if (event.origin === "https://trusted.com") {
    document.getElementById("output").innerHTML = event.data.html;
    // Even with origin check, the trusted origin might be compromised
  }
});

// VULNERABLE: eval from message data
window.addEventListener("message", (event) => {
  eval(event.data.code);
});

// VULNERABLE: redirect from message data
window.addEventListener("message", (event) => {
  window.location = event.data.url;
});
```

## Safe Patterns

### Strict Origin Validation

```javascript
// SAFE: exact origin match
window.addEventListener("message", (event) => {
  if (event.origin !== "https://trusted.example.com") return;
  processData(event.data);
});

// SAFE: allowlist of origins
const ALLOWED_ORIGINS = new Set(["https://app.example.com", "https://admin.example.com"]);

window.addEventListener("message", (event) => {
  if (!ALLOWED_ORIGINS.has(event.origin)) return;
  processData(event.data);
});
```

### Specific Target Origin

```javascript
// SAFE: specify exact target origin
iframe.contentWindow.postMessage(data, "https://trusted.example.com");
window.parent.postMessage(result, "https://app.example.com");
```

### Validate Message Structure

```javascript
// SAFE: validate message type and structure before processing
window.addEventListener("message", (event) => {
  if (event.origin !== "https://trusted.example.com") return;
  if (typeof event.data !== "object") return;
  if (event.data.type !== "RESIZE_FRAME") return;
  if (typeof event.data.height !== "number") return;

  iframe.style.height = `${event.data.height}px`;
});
```

## Common Use Cases and Risks

| Use Case               | Risk                         | Mitigation                       |
| ---------------------- | ---------------------------- | -------------------------------- |
| iframe resizing        | Low (height is numeric)      | Validate type is number          |
| Auth token passing     | Critical (token theft)       | Exact origin + specific target   |
| Cross-origin form data | High (data injection)        | Origin check + schema validation |
| Widget configuration   | Medium (config manipulation) | Origin check + allowlisted keys  |
| Analytics events       | Low (non-sensitive data)     | Origin check still recommended   |

## Verification Checklist

1. Does every `message` event listener validate `event.origin` with exact string match?
2. Is `postMessage` called with a specific target origin (never `"*"` with sensitive data)?
3. Is message data validated for expected type and structure before use?
4. Is message data ever passed to `innerHTML`, `eval`, or `location`?
5. Are origin checks using `includes()` or `indexOf()` (easily bypassed)?
