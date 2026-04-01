import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import * as http from "node:http";
import { runBrowser } from "../src/browser";
import type { BrowserEngine } from "../src/types";

interface RecordedRequest {
  method: string;
  path: string;
  body: string;
}

const startBrowserApp = async () => {
  const requests: RecordedRequest[] = [];
  const server = http.createServer(async (request, response) => {
    const path = request.url ?? "/";
    const method = request.method ?? "GET";

    const body = await new Promise<string>((resolve) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

    requests.push({ method, path, body });

    if (path === "/api/settings" && method === "POST") {
      const payload = JSON.parse(body) as { workspaceName?: string; activeWorkspace?: string };
      const workspaceName = payload.workspaceName?.trim() || "Untitled workspace";
      const activeWorkspace = payload.activeWorkspace ?? "alpha";

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          status: `Saved ${workspaceName}`,
          activeWorkspace,
        }),
      );
      return;
    }

    if (path === "/done") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        `<html><body><h1>Setup complete</h1><p id="done-status">ready for browser tasks</p></body></html>`,
      );
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(`<html><body>
      <h1>Workspace setup</h1>
      <label for="workspace-name">Workspace name</label>
      <input id="workspace-name" type="text" />
      <section aria-label="Available workspaces">
        <article>
          <h2>Alpha</h2>
          <button type="button" onclick="window.selectWorkspace('alpha')">Open</button>
        </article>
        <article>
          <h2>Beta</h2>
          <button type="button" onclick="window.selectWorkspace('beta')">Open</button>
        </article>
      </section>
      <button
        id="save"
        onclick="window.saveSettings()"
      >
        Save settings
      </button>
      <button id="navigate" onclick="setTimeout(() => { window.location.href='/done'; }, 50)">
        Continue
      </button>
      <p id="active-workspace">alpha</p>
      <p id="status">Draft</p>
      <script>
        window.selectWorkspace = (workspaceId) => {
          document.body.dataset.activeWorkspace = workspaceId;
          document.getElementById('active-workspace').textContent = workspaceId;
        };

        window.saveSettings = async () => {
          const workspaceName = document.getElementById('workspace-name').value.trim();
          const activeWorkspace = document.body.dataset.activeWorkspace || 'alpha';
          const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceName, activeWorkspace }),
          });
          const result = await response.json();
          document.getElementById('status').textContent = result.status + ' for ' + result.activeWorkspace;
        };
      </script>
    </body></html>`);
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve browser test server address"));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    server,
    origin: `http://127.0.0.1:${port}`,
    requests,
  };
};

describe("browser e2e", () => {
  let server: http.Server;
  let origin: string;
  let requests: RecordedRequest[];

  beforeAll(async () => {
    const app = await startBrowserApp();
    server = app.server;
    origin = app.origin;
    requests = app.requests;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("creates a real page and snapshots interactive content", async () => {
    const session = await runBrowser((browser) =>
      browser.createPage(origin, { waitUntil: "domcontentloaded" }),
    );

    try {
      expect(session.page.url()).toBe(`${origin}/`);

      const snapshot = await runBrowser((browser) =>
        browser.snapshot(session.page, { interactive: true }),
      );

      expect(snapshot.tree).toContain(`textbox "Workspace name"`);
      expect(snapshot.tree).toContain(`button "Open"`);
      expect(snapshot.tree).toContain(`button "Save settings"`);
      expect(snapshot.tree).toContain(`button "Continue"`);
      expect(snapshot.stats.interactiveRefs).toBeGreaterThanOrEqual(5);
    } finally {
      await session.browser.close();
    }
  });

  it("fills state through Browser.act and preserves the updated value in snapshots", async () => {
    const session = await runBrowser((browser) => browser.createPage(origin));

    try {
      const before = await runBrowser((browser) =>
        browser.snapshot(session.page, { interactive: true }),
      );
      const nameRef = Object.keys(before.refs).find(
        (key) => before.refs[key].role === "textbox" && before.refs[key].name === "Workspace name",
      );

      expect(nameRef).toBeDefined();

      const after = await runBrowser((browser) =>
        browser.act(session.page, nameRef!, (locator) => locator.fill("Browser smoke"), {
          interactive: true,
        }),
      );

      expect(after.tree).toContain("Browser smoke");
      expect(await session.page.locator("#workspace-name").inputValue()).toBe("Browser smoke");
    } finally {
      await session.browser.close();
    }
  });

  it("resolves duplicate refs and saves settings through a real network roundtrip", async () => {
    requests.length = 0;

    const session = await runBrowser((browser) => browser.createPage(origin));

    try {
      await session.page.locator("#workspace-name").fill("Browser smoke");

      const snapshot = await runBrowser((browser) =>
        browser.snapshot(session.page, { interactive: true }),
      );

      const openRefs = Object.entries(snapshot.refs).filter(
        ([, entry]) => entry.role === "button" && entry.name === "Open",
      );
      expect(openRefs).toHaveLength(2);
      expect(openRefs.map(([, entry]) => entry.nth)).toEqual([0, 1]);

      const betaOpenLocator = await Effect.runPromise(snapshot.locator(openRefs[1][0]));
      await betaOpenLocator.click();

      expect(await session.page.locator("#active-workspace").textContent()).toBe("beta");

      const saveRef = Object.keys(snapshot.refs).find(
        (key) =>
          snapshot.refs[key].role === "button" && snapshot.refs[key].name === "Save settings",
      );
      expect(saveRef).toBeDefined();

      const saveLocator = await Effect.runPromise(snapshot.locator(saveRef!));
      await saveLocator.click();

      await session.page.waitForFunction(
        () => document.getElementById("status")?.textContent === "Saved Browser smoke for beta",
      );
      expect(await session.page.locator("#status").textContent()).toBe(
        "Saved Browser smoke for beta",
      );

      const apiRequest = requests.find((request) => request.path === "/api/settings");
      expect(apiRequest).toBeDefined();
      expect(apiRequest?.method).toBe("POST");
      expect(apiRequest?.body).toContain(`"workspaceName":"Browser smoke"`);
      expect(apiRequest?.body).toContain(`"activeWorkspace":"beta"`);

      const savedSnapshot = await runBrowser((browser) => browser.snapshot(session.page));
      expect(savedSnapshot.tree).toContain(`paragraph: beta`);
      expect(savedSnapshot.tree).toContain(`paragraph: Saved Browser smoke for beta`);
    } finally {
      await session.browser.close();
    }
  });

  it("supports selector-scoped snapshots for a focused part of the page", async () => {
    const session = await runBrowser((browser) => browser.createPage(origin));

    try {
      const result = await runBrowser((browser) =>
        browser.snapshot(session.page, {
          selector: 'section[aria-label="Available workspaces"]',
          interactive: true,
          compact: true,
        }),
      );

      expect(result.tree).toContain(`button "Open"`);
      expect(result.tree).not.toContain(`textbox "Workspace name"`);
      expect(result.stats.interactiveRefs).toBe(2);
    } finally {
      await session.browser.close();
    }
  });

  it("returns annotated screenshots for interactive elements after building the runtime", async () => {
    const session = await runBrowser((browser) => browser.createPage(origin));

    try {
      const result = await runBrowser((browser) =>
        browser.annotatedScreenshot(session.page, { interactive: true, fullPage: true }),
      );

      expect(result.screenshot.byteLength).toBeGreaterThan(0);
      expect(result.annotations.length).toBeGreaterThanOrEqual(5);
      expect(result.annotations.some((annotation) => annotation.name === "Workspace name")).toBe(
        true,
      );
      expect(result.annotations.filter((annotation) => annotation.name === "Open")).toHaveLength(2);
    } finally {
      await session.browser.close();
    }
  });

  it("waits for client-side navigation to settle after a click", async () => {
    const session = await runBrowser((browser) => browser.createPage(origin));

    try {
      const urlBefore = session.page.url();

      await session.page.getByRole("button", { name: "Continue" }).click();
      await runBrowser((browser) => browser.waitForNavigationSettle(session.page, urlBefore));

      expect(session.page.url()).toBe(`${origin}/done`);

      const snapshot = await runBrowser((browser) => browser.snapshot(session.page));
      expect(snapshot.tree).toContain(`heading "Setup complete"`);
    } finally {
      await session.browser.close();
    }
  });
});

const tryLaunchEngine = async (engineName: BrowserEngine, testOrigin: string) => {
  try {
    const session = await runBrowser((browser) =>
      browser.createPage(testOrigin, { browserType: engineName, waitUntil: "domcontentloaded" }),
    );
    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Executable doesn't exist")) return undefined;
    throw error;
  }
};

describe("cross-browser engine support", () => {
  let server: http.Server;
  let origin: string;

  beforeAll(async () => {
    const app = await startBrowserApp();
    server = app.server;
    origin = app.origin;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("launches webkit and snapshots the page", async () => {
    const session = await tryLaunchEngine("webkit", origin);
    if (!session) return;

    try {
      expect(session.page.url()).toBe(`${origin}/`);

      const snapshot = await runBrowser((browser) => browser.snapshot(session.page));
      expect(snapshot.tree).toContain(`heading "Workspace setup"`);
      expect(snapshot.tree).toContain(`button "Save settings"`);
    } finally {
      await session.browser.close();
    }
  });

  it("launches firefox and snapshots the page", async () => {
    const session = await tryLaunchEngine("firefox", origin);
    if (!session) return;

    try {
      expect(session.page.url()).toBe(`${origin}/`);

      const snapshot = await runBrowser((browser) => browser.snapshot(session.page));
      expect(snapshot.tree).toContain(`heading "Workspace setup"`);
      expect(snapshot.tree).toContain(`button "Save settings"`);
    } finally {
      await session.browser.close();
    }
  });

  it("webkit session supports interaction via act", async () => {
    const session = await tryLaunchEngine("webkit", origin);
    if (!session) return;

    try {
      const snapshot = await runBrowser((browser) =>
        browser.snapshot(session.page, { interactive: true }),
      );
      const nameRef = Object.keys(snapshot.refs).find(
        (key) =>
          snapshot.refs[key].role === "textbox" && snapshot.refs[key].name === "Workspace name",
      );
      expect(nameRef).toBeDefined();

      const after = await runBrowser((browser) =>
        browser.act(session.page, nameRef!, (locator) => locator.fill("WebKit test"), {
          interactive: true,
        }),
      );
      expect(after.tree).toContain("WebKit test");
    } finally {
      await session.browser.close();
    }
  });

  it("can switch between chromium and webkit sessions", async () => {
    const chromiumSession = await runBrowser((browser) =>
      browser.createPage(origin, { waitUntil: "domcontentloaded" }),
    );
    const chromiumSnapshot = await runBrowser((browser) => browser.snapshot(chromiumSession.page));
    expect(chromiumSnapshot.tree).toContain(`heading "Workspace setup"`);
    await chromiumSession.browser.close();

    const webkitSession = await tryLaunchEngine("webkit", origin);
    if (!webkitSession) return;

    try {
      const webkitSnapshot = await runBrowser((browser) => browser.snapshot(webkitSession.page));
      expect(webkitSnapshot.tree).toContain(`heading "Workspace setup"`);
    } finally {
      await webkitSession.browser.close();
    }
  });
});
