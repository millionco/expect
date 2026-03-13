# browser tester codebase

```
apps/cli              tui for picking git scope and streaming agent output
packages/agent        ai model adapters (claude, codex, cursor)
packages/browser      core browser automation, snapshot, mcp server
packages/cookies      extract cookies from local browsers for auth
packages/browser-tester-cli   cli wrapper around packages/browser
packages/utils        shared helpers
```

## dependency graph

```
apps/cli
  |
  v
packages/agent ----> packages/utils

packages/browser-tester-cli
  |
  v
packages/browser ---> packages/cookies ---> packages/utils
```

## how the a11y tree snapshot works

the snapshot system in `packages/browser` turns a live page into a compact, ref-labeled accessibility tree that an agent can reason about.

```
page.ariaSnapshot()
  |
  v
raw aria tree (string of "- role name" lines)
  |
  v
parse each line with parseAriaLine (regex extracts role, name, depth)
  |
  v
filter to interactive roles (button, link, textbox, combobox, ...)
  and content roles (heading, cell, region, ...)
  |
  v
assign refs: e1, e2, e3, ... to each kept element
  |
  v
(optional) findCursorInteractive
  finds elements with cursor:pointer, onclick, or tabindex
  that aria missed, appends them as synthetic "clickable" refs
  |
  v
resolveNthDuplicates
  if two elements share the same role+name, adds nth index
  |
  v
(optional) compactTree
  strips structural lines (like generic divs) that have no refs
  |
  v
output: { tree, refs, stats, locator }
```

`refs` is a map from ref id (e1, e2, ...) to a locator descriptor (role, name, nth). the `locator` function takes a ref and returns a playwright locator so the agent can act on it.

the snapshot also supports options like `maxDepth`, `interactive` (only interactive elements), and `selector` (scope to a css selector).

## how cookies work

`packages/cookies` extracts cookies from your local browsers so playwright can reuse your existing auth sessions.

```
extractCookies({ url, browsers })
  |
  v
for each browser (chromium, firefox, safari):
  |
  +-- chromium: query sqlite db, decrypt via keychain (macos),
  |             secret-tool (linux), or dpapi (windows)
  |
  +-- firefox:  query sqlite db directly (no encryption)
  |
  +-- safari:   parse Cookies.binarycookies file
  |
  v
dedupe cookies across browsers
  |
  v
{ cookies, warnings }
```

there is also a profile-based extraction path that uses `detectBrowserProfiles` to find profile directories, then extracts per-profile via cdp for chromium or sqlite for firefox/safari.

### injection into packages/browser

when `createPage` is called with `cookies: true`:

1. detect the user's default browser
2. extract cookies for the target url from that browser
3. build a `CookieJar` and call `jar.toPlaywright()` to convert to playwright's format
4. call `context.addCookies(...)` before navigating

this lets the agent browse authenticated pages without manual login.

## the agent and mcp/cli interface

the agent (from `packages/agent`) uses an ai model to drive testing. it can interact with the browser through two interfaces:

### mcp server (packages/browser)

a stdio-based mcp server that exposes tools like `open`, `snapshot`, `click`, `fill`, `type`, `select`, `hover`, `screenshot`, `annotated_screenshot`, `diff`, `navigate`, `scroll`, `press_key`, `javascript`, and more. the agent calls these tools in a loop: snapshot the page, decide what to do, act, snapshot again, diff.

### cli (packages/browser-tester-cli)

a commander-based cli that wraps the same browser automation. commands: `snapshot`, `click`, `fill`, `type`, `select`, `hover`, `screenshot`, `diff`. each command follows a common pattern:

```
user runs: browser-tester-cli click example.com --ref e3
  |
  v
withPage(url, options, action)
  creates browser, navigates, optionally injects cookies
  |
  v
snapshot the page, resolve ref e3 to a locator
  |
  v
perform the click
  |
  v
snapshot again, diff before/after trees
  |
  v
output the diff (what changed on the page)
```

## apps/cli as the user-facing entry point

`apps/cli` is a react/ink terminal ui that ties everything together. it is what the user actually runs.

```
user launches cli
  |
  v
getGitState()
  detects repo state: unstaged changes, current branch, commits
  |
  v
menu: test unstaged changes / test branch / pick commit / switch branch
  |
  v
on selection, opens TestingScreen
  |
  v
agentStream({ action, gitState, commit })
  creates a claude model via packages/agent
  streams text back to the tui
  |
  v
agent uses mcp tools from packages/browser
  to navigate, snapshot, interact, and verify behavior
  |
  v
results stream into the terminal ui in real time
```

the agent receives a prompt based on the git scope (e.g. "test the unstaged changes" or "test branch feature-x") and autonomously drives the browser to test the relevant code changes.
