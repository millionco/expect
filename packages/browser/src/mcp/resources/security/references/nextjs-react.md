# Next.js and React Security

Security patterns specific to Next.js App Router, React Server Components, and React client-side code.

## Server Components: Data Leakage

Server Components blur the line between server and client. The primary risk is accidentally exposing sensitive data to the client through props.

### Passing Too Much Data to Client Components

```tsx
// VULNERABLE: passing entire database record to client component
export default async function Page({ params }) {
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${params.slug}`;
  const userData = rows[0];
  return <Profile user={userData} />;
}

// The client bundle now contains: email, phone, ssn, internal IDs, etc.
```

```tsx
// SAFE: only pass the fields the client needs
export default async function Page({ params }) {
  const profile = await getProfileDTO(params.slug);
  return <Profile username={profile.username} avatar={profile.avatar} />;
}
```

### Client Component Props Audit

Every `"use client"` file's exported component props should be reviewed:

- Are props accepting overly broad types (full `User` object instead of `{ name: string }`)?
- Do props include fields like `token`, `secret`, `creditCard`, `ssn`, `password`?
- Could a narrower type satisfy what the component actually renders?

```tsx
"use client";

// BAD: accepts the full user record
export default function Profile({ user }: { user: User }) {
  return <h1>{user.name}</h1>;
}

// GOOD: accepts only what it renders
export default function Profile({ name }: { name: string }) {
  return <h1>{name}</h1>;
}
```

## Data Access Layer

For new projects, consolidate all data access into a dedicated layer that enforces authorization before returning data.

```tsx
import "server-only";
import { getCurrentUser } from "./auth";

export async function getProfileDTO(slug: string) {
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${slug}`;
  const userData = rows[0];
  const currentUser = await getCurrentUser();

  return {
    username: userData.username,
    phonenumber: canSeePhoneNumber(currentUser, userData.team) ? userData.phonenumber : undefined,
  };
}
```

Key patterns:

- Use `import "server-only"` to guarantee server-only execution
- Verify authorization inside the data access layer, not in components
- Return DTOs (Data Transfer Objects) with only the fields the caller needs
- Store secrets in env vars; only the data access layer should read `process.env`

## Server Actions ("use server")

Server Actions are exposed as POST endpoints. Any exported function in a `"use server"` file can be invoked by the client with any arguments.

### Validate All Arguments

```tsx
"use server";

// VULNERABLE: trusts client-provided arguments
export async function deletePost(id: number) {
  await db.posts.delete(id);
}

// SAFE: validates arguments and checks authorization
export async function deletePost(id: number) {
  if (typeof id !== "number") {
    throw new Error("Invalid argument");
  }
  const user = await getCurrentUser();
  if (!canDeletePost(user, id)) {
    throw new Error("Forbidden");
  }
  await db.posts.delete(id);
}
```

### Re-authorize on Every Action

TypeScript types are not enforced at runtime. Always:

1. Validate argument types (use Zod or manual checks)
2. Re-read the current user from cookies (don't trust passed-in user data)
3. Check authorization for the specific resource

### Server Action Closures

Closed-over variables in Server Actions are serialized and sent to the client. In Next.js 14+, they are encrypted, but `.bind()` values are NOT encrypted.

```tsx
// Closed-over variables are encrypted (safe by default)
export default function Page() {
  const secretConfig = await getConfig();
  async function doAction() {
    "use server";
    // secretConfig is encrypted in transit
  }
  return <button action={doAction}>Go</button>;
}

// .bind() values are NOT encrypted (be careful)
async function doAction(postId: number) {
  "use server";
}
export default function Page() {
  const post = await getPost(slug);
  return <button action={doAction.bind(null, post.id)}>Delete</button>;
  // post.id is visible in the client payload
}
```

### CSRF Protection

Server Actions only accept POST requests. Next.js compares the `Origin` header to `Host`/`X-Forwarded-Host`. Combined with SameSite cookies (default in modern browsers), this provides baseline CSRF protection.

Known vulnerability: `null` origin from sandboxed iframes can bypass this check. If your app embeds in iframes, add explicit CSRF token validation.

Custom Route Handlers (`route.tsx`) do NOT get automatic CSRF protection. Apply it manually.

## Environment Variable Exposure

```tsx
// VULNERABLE: NEXT_PUBLIC_ variables are bundled into client code
// .env
NEXT_PUBLIC_API_KEY=sk-secret-key-123
// This is now visible in the browser's JavaScript bundle

// SAFE: only prefix with NEXT_PUBLIC_ for truly public values
// .env
NEXT_PUBLIC_APP_NAME=MyApp           // fine: not sensitive
DATABASE_URL=postgres://...           // server-only: no prefix
API_SECRET=sk-secret-key-123          // server-only: no prefix
```

### Audit Checklist for Env Vars

- Search for `NEXT_PUBLIC_` in `.env*` files
- Verify none contain API keys, secrets, database URLs, or tokens
- Only app name, public API URLs, feature flags should be `NEXT_PUBLIC_`

## server-only Package

Mark modules that must never run on the client:

```tsx
import "server-only";

// If a Client Component imports this module, the build fails
export async function getSecretData() {
  return db.query("SELECT * FROM secrets");
}
```

Use `server-only` on:

- Data access layer modules
- Auth helpers that read cookies or tokens
- Anything that accesses `process.env` secrets
- Database query modules

## Route Handlers (route.tsx)

Custom Route Handlers are escape hatches with fewer built-in protections:

- No automatic CSRF protection (unlike Server Actions)
- GET handlers can set cookies, enabling CSRF if not careful
- Must manually validate auth and input

```tsx
// VULNERABLE: no auth check, no CSRF protection on POST
export async function POST(request: Request) {
  const data = await request.json();
  await db.settings.update(data);
  return Response.json({ ok: true });
}

// SAFE: auth + input validation
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const data = await request.json();
  const parsed = settingsSchema.parse(data);
  await db.settings.update(user.id, parsed);
  return Response.json({ ok: true });
}
```

## Middleware Security

Middleware controls access to pages. Prefer allowlists over denylists.

```tsx
// VULNERABLE: denylist approach (easy to miss new routes)
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin")) {
    return requireAuth(request);
  }
  // New routes are unprotected by default
}

// SAFE: allowlist approach
const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/about"]);

export function middleware(request: NextRequest) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  return requireAuth(request);
}
```

Important: middleware runs for both HTML page loads and client-side RSC/JSON navigations. If middleware allows reading a page, Server Actions on that page are also accessible.

## Dynamic Route Parameters

Folders with brackets (`/[param]/`) are user input. Always validate:

```tsx
// VULNERABLE: trusting param without validation
export default async function Page({ params }) {
  const data = await getTeamData(params.team);
  // User can set params.team to anything
}

// SAFE: validate param against user permissions
export default async function Page({ params }) {
  const user = await getCurrentUser();
  const team = await getTeamIfMember(user, params.team);
  if (!team) notFound();
}
```

`searchParams` should never be used for authorization:

```tsx
// VULNERABLE: trusting searchParams for auth decisions
export default function Page({ searchParams }) {
  if (searchParams.isAdmin === "true") {
    return <AdminPanel />;
  }
}
```

## Error Handling

In production mode, React replaces server error messages with generic ones before sending to the client. In development mode, full error messages are sent.

```tsx
// RISKY: error message contains sensitive data
throw new Error(`${creditCardNumber} is not a valid phone number`);
// In dev mode, this leaks to the client

// SAFE: generic error message
throw new Error("Invalid phone number format");
```

Always run production mode for production workloads. Never deploy with `NODE_ENV=development`.

## React XSS Patterns

### href with javascript: Protocol

```tsx
// VULNERABLE: user-controlled href can execute JavaScript
<a href={userInput}>Link</a>
// If userInput = "javascript:alert(document.cookie)"

// SAFE: validate protocol
const isSafeHref = (url: string) => /^https?:\/\//.test(url) || url.startsWith("/")
<a href={isSafeHref(userInput) ? userInput : "#"}>Link</a>
```

### Rendering User HTML

```tsx
// VULNERABLE: rendering user-provided HTML
<div dangerouslySetInnerHTML={{ __html: userComment }} />;

// SAFE: sanitize first
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userComment) }} />;
```

### SSR-Specific

During SSR, both Server and Client Components render on the server. Client Components in SSR should be treated with the same security policy as browser code. They should not access privileged data or private APIs.

## Security Headers in Next.js

```javascript
// next.config.js
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

module.exports = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  productionBrowserSourceMaps: false,
};
```

Disable `productionBrowserSourceMaps` to prevent exposing source code in production.

## Verification Checklist

1. Are `"use client"` component props accepting only the minimum required data?
2. Do all Server Actions validate arguments and re-check authorization?
3. Are `NEXT_PUBLIC_` env vars free of secrets, API keys, and tokens?
4. Do sensitive modules use `import "server-only"`?
5. Are custom Route Handlers (`route.tsx`) protected against CSRF?
6. Does middleware use an allowlist (not denylist) for public routes?
7. Are dynamic route params (`[slug]`) validated before use?
8. Is `dangerouslySetInnerHTML` used only with sanitized content?
9. Are `href` attributes validated to block `javascript:` protocol?
10. Is `productionBrowserSourceMaps` set to `false`?
11. Are searchParams never used for authorization decisions?
