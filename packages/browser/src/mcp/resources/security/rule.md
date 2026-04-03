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

Report only HIGH CONFIDENCE findings with confirmed attacker-controlled input reaching a dangerous sink.

## Checklist

- [ ] Report only on the specific file/diff provided; research the ENTIRE codebase for context
- [ ] Trace data flow for every potential issue — where does the input actually come from?
- [ ] Check for sanitization elsewhere (DOMPurify, allowlists, encoding) before flagging
- [ ] Check framework protections (React auto-escaping, CSP, CSRF tokens) before flagging
- [ ] Do NOT flag: test files, dead code, constants, server-controlled config, or `process.env`
- [ ] Do NOT flag: React `{variable}` or Vue `{{ variable }}` (auto-escaped by default)
- [ ] Only flag framework patterns when user input reaches `dangerouslySetInnerHTML`, `v-html`, `innerHTML`
- [ ] Always flag: `eval(userInput)`, `new Function(userInput)`, `document.write(userInput)`, hardcoded secrets
- [ ] Verify attacker control: URL params, `location.hash`, `postMessage`, `document.referrer`, user-generated content
- [ ] Server-controlled values are NOT attacker-controlled: env vars, config files, hardcoded constants
- [ ] Classify severity correctly: Critical (direct exploit) > High (conditional) > Medium (specific conditions)
- [ ] Missing CSP is Medium (defense-in-depth), not Critical
- [ ] Skip LOW confidence/theoretical issues — they waste developer time
- [ ] Do not flag lack of TLS; be careful recommending HSTS without deployment context

## Sub-Rules

- `expect://rules/security/client-storage`
- `expect://rules/security/cookies`
- `expect://rules/security/cors`
- `expect://rules/security/csp`
- `expect://rules/security/csrf`
- `expect://rules/security/nextjs-react`
- `expect://rules/security/open-redirect`
- `expect://rules/security/postmessage`
- `expect://rules/security/prototype-pollution`
- `expect://rules/security/xss`
