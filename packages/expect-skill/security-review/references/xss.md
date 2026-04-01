# Cross-Site Scripting (XSS)

DOM-based, reflected, and stored XSS in browser environments.

## DOM-Based XSS

### Dangerous Sinks

These DOM APIs execute or render attacker-controlled input:

| Sink                        | Risk     | Safe Alternative              |
| --------------------------- | -------- | ----------------------------- |
| `element.innerHTML`         | High     | `element.textContent`         |
| `element.outerHTML`         | High     | DOM API (`createElement`)     |
| `document.write()`         | High     | DOM API                       |
| `document.writeln()`       | High     | DOM API                       |
| `eval()`                   | Critical | Never use with user input     |
| `new Function(string)`     | Critical | Never use with user input     |
| `setTimeout(string)`       | Critical | `setTimeout(function)`        |
| `setInterval(string)`      | Critical | `setInterval(function)`       |
| `location.href = input`    | Medium   | Validate against allowlist    |
| `window.open(input)`       | Medium   | Validate against allowlist    |

### Dangerous Sources

User-controlled values that can carry XSS payloads:

| Source                       | Notes                                    |
| ---------------------------- | ---------------------------------------- |
| `location.hash`             | Fragment after `#`, not sent to server   |
| `location.search`           | Query string                             |
| `location.pathname`         | URL path segments                        |
| `document.referrer`         | Previous page URL                        |
| `window.name`               | Persists across navigations              |
| `postMessage` event data    | From any origin if not validated          |
| `document.cookie`           | If set by attacker via XSS elsewhere     |

### Always Vulnerable

```javascript
element.innerHTML = userInput
document.getElementById("output").innerHTML = location.hash.slice(1)
document.write("<h1>" + userInput + "</h1>")
eval(location.hash.slice(1))
setTimeout("doSomething('" + userInput + "')", 100)
```

### Safe Patterns

```javascript
// Use textContent for plain text
element.textContent = userInput

// Use DOMPurify when HTML rendering is required
import DOMPurify from "dompurify"
element.innerHTML = DOMPurify.sanitize(userInput)

// Use DOM APIs to build elements
const div = document.createElement("div")
div.textContent = userInput
container.appendChild(div)
```

## Framework-Specific

### React

```jsx
// SAFE: JSX auto-escapes by default
<div>{userInput}</div>
<p>{dangerousString}</p>

// VULNERABLE: bypasses auto-escaping
<div dangerouslySetInnerHTML={{__html: userInput}} />

// SAFE: sanitize before dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(userInput)}} />

// VULNERABLE: href with javascript: protocol
<a href={userInput}>Link</a>
// If userInput = "javascript:alert(1)", this executes

// SAFE: validate href protocol
const safeHref = /^https?:\/\//.test(userInput) ? userInput : "#"
<a href={safeHref}>Link</a>
```

### Vue

```html
<!-- SAFE: mustache syntax auto-escapes -->
<div>{{ userInput }}</div>

<!-- VULNERABLE: v-html bypasses escaping -->
<div v-html="userInput" />

<!-- SAFE: sanitize before v-html -->
<div v-html="sanitize(userInput)" />
```

### Next.js / SSR

```jsx
// VULNERABLE: rendering user input in server-rendered HTML without escaping
export default function Page({ searchParams }) {
  return <div dangerouslySetInnerHTML={{__html: searchParams.q}} />
}

// SAFE: framework auto-escapes in JSX
export default function Page({ searchParams }) {
  return <div>{searchParams.q}</div>
}
```

## Stored XSS

Stored XSS occurs when user input is saved to a database and later rendered without escaping. The vulnerability is at the rendering point, not the storage point.

### Common Vectors

- User profile fields (name, bio, website URL)
- Comments and messages
- File names displayed in UI
- Custom labels and metadata
- Markdown/rich text rendered as HTML

### Defense

1. Escape output at render time (React/Vue do this by default in JSX/templates)
2. Sanitize HTML if rich text is required (DOMPurify on the client, sanitize-html on the server)
3. Set Content-Security-Policy headers to limit impact

## jQuery XSS

```javascript
// VULNERABLE: passing user input to jQuery constructors
$(userInput)
$(element).html(userInput)
$(element).append(userInput)
$("<div>" + userInput + "</div>")

// SAFE: use .text() for plain text
$(element).text(userInput)

// SAFE: build elements explicitly
$("<div>").text(userInput).appendTo(container)
```

## Verification Checklist

1. Is user input inserted into the DOM via `innerHTML`, `outerHTML`, or `document.write`?
2. Is `dangerouslySetInnerHTML` or `v-html` used with unsanitized user input?
3. Is user input passed to `eval`, `setTimeout(string)`, or `new Function`?
4. Are `href` or `src` attributes set with unvalidated user input (javascript: protocol)?
5. Is a sanitization library (DOMPurify) used when HTML rendering is required?
6. Is user input from URL fragments, query params, or postMessage reaching a dangerous sink?
