import { Effect, Layer, Option } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import * as http from "node:http";
import { Playwright } from "../src/playwright";
import { Artifacts } from "../src/artifacts";

const playwrightLayer = Playwright.layer.pipe(Layer.provide(Artifacts.layerTest(() => {})));

const run = <A>(effect: Effect.Effect<A, unknown, Playwright>) =>
  Effect.runPromise(effect.pipe(Effect.provide(playwrightLayer)));

const withSession = <A>(
  url: string,
  fn: (pw: typeof Playwright.Service) => Effect.Effect<A, unknown>,
) =>
  run(
    Effect.gen(function* () {
      const pw = yield* Playwright;
      yield* pw.open({
        headless: true,
        browserProfile: Option.none(),
        initialNavigation: Option.some({ url, waitUntil: "domcontentloaded" as const }),
        cdpUrl: Option.none(),
      });
      return yield* fn(pw);
    }).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          const pw = yield* Playwright;
          if (pw.hasSession()) yield* pw.close();
        }),
      ),
    ),
  );

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
    await withSession(origin, (pw) =>
      Effect.gen(function* () {
        const snapshot = yield* pw.snapshot({ interactive: true });
        expect(snapshot.tree).toContain(`textbox "Workspace name"`);
        expect(snapshot.tree).toContain(`button "Open"`);
        expect(snapshot.tree).toContain(`button "Save settings"`);
        expect(snapshot.tree).toContain(`button "Continue"`);
        expect(snapshot.stats.interactiveRefs).toBeGreaterThanOrEqual(5);
      }),
    );
  });

  it("fills state through act and preserves the updated value in snapshots", async () => {
    await withSession(origin, (pw) =>
      Effect.gen(function* () {
        const before = yield* pw.snapshot({ interactive: true });
        const nameRef = Object.keys(before.refs).find(
          (key) =>
            before.refs[key].role === "textbox" && before.refs[key].name === "Workspace name",
        );
        expect(nameRef).toBeDefined();

        const after = yield* pw.act(nameRef!, (locator) => locator.fill("Browser smoke"), {
          interactive: true,
        });
        expect(after.tree).toContain("Browser smoke");

        const page = yield* pw.getPage;
        expect(yield* Effect.tryPromise(() => page.locator("#workspace-name").inputValue())).toBe(
          "Browser smoke",
        );
      }),
    );
  });

  it("resolves duplicate refs and saves settings through a real network roundtrip", async () => {
    requests.length = 0;

    await withSession(origin, (pw) =>
      Effect.gen(function* () {
        const page = yield* pw.getPage;
        yield* Effect.tryPromise(() => page.locator("#workspace-name").fill("Browser smoke"));

        const snapshot = yield* pw.snapshot({ interactive: true });

        const openRefs = Object.entries(snapshot.refs).filter(
          ([, entry]) => entry.role === "button" && entry.name === "Open",
        );
        expect(openRefs).toHaveLength(2);
        expect(openRefs.map(([, entry]) => entry.nth)).toEqual([0, 1]);

        const betaOpenLocator = yield* snapshot.locator(openRefs[1][0]);
        yield* Effect.tryPromise(() => betaOpenLocator.click());

        expect(
          yield* Effect.tryPromise(() => page.locator("#active-workspace").textContent()),
        ).toBe("beta");

        const saveRef = Object.keys(snapshot.refs).find(
          (key) =>
            snapshot.refs[key].role === "button" && snapshot.refs[key].name === "Save settings",
        );
        expect(saveRef).toBeDefined();

        const saveLocator = yield* snapshot.locator(saveRef!);
        yield* Effect.tryPromise(() => saveLocator.click());

        yield* Effect.tryPromise(() =>
          page.waitForFunction(
            () => document.getElementById("status")?.textContent === "Saved Browser smoke for beta",
          ),
        );
        expect(yield* Effect.tryPromise(() => page.locator("#status").textContent())).toBe(
          "Saved Browser smoke for beta",
        );

        const apiRequest = requests.find((request) => request.path === "/api/settings");
        expect(apiRequest).toBeDefined();
        expect(apiRequest?.method).toBe("POST");
        expect(apiRequest?.body).toContain(`"workspaceName":"Browser smoke"`);
        expect(apiRequest?.body).toContain(`"activeWorkspace":"beta"`);

        const savedSnapshot = yield* pw.snapshot({});
        expect(savedSnapshot.tree).toContain(`paragraph: beta`);
        expect(savedSnapshot.tree).toContain(`paragraph: Saved Browser smoke for beta`);
      }),
    );
  });

  it("supports selector-scoped snapshots for a focused part of the page", async () => {
    await withSession(origin, (pw) =>
      Effect.gen(function* () {
        const result = yield* pw.snapshot({
          selector: 'section[aria-label="Available workspaces"]',
          interactive: true,
          compact: true,
        });

        expect(result.tree).toContain(`button "Open"`);
        expect(result.tree).not.toContain(`textbox "Workspace name"`);
        expect(result.stats.interactiveRefs).toBe(2);
      }),
    );
  });

  it("returns annotated screenshots for interactive elements", async () => {
    await withSession(origin, (pw) =>
      Effect.gen(function* () {
        const result = yield* pw.annotatedScreenshot({
          interactive: true,
          fullPage: true,
        });

        expect(result.screenshot.byteLength).toBeGreaterThan(0);
        expect(result.annotations.length).toBeGreaterThanOrEqual(5);
        expect(result.annotations.some((annotation) => annotation.name === "Workspace name")).toBe(
          true,
        );
        expect(result.annotations.filter((annotation) => annotation.name === "Open")).toHaveLength(
          2,
        );
      }),
    );
  });

  it("waits for client-side navigation to settle after a click", async () => {
    await withSession(origin, (pw) =>
      Effect.gen(function* () {
        const page = yield* pw.getPage;
        const urlBefore = page.url();

        yield* Effect.tryPromise(() => page.getByRole("button", { name: "Continue" }).click());
        yield* pw.waitForNavigationSettle(urlBefore);

        expect(page.url()).toBe(`${origin}/done`);

        const snapshot = yield* pw.snapshot({});
        expect(snapshot.tree).toContain(`heading "Setup complete"`);
      }),
    );
  });
});
