import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Cookie } from "@browser-tester/cookies";
import { injectCookies } from "./helpers/inject-cookies";
import { createPage } from "./helpers/create-page";

interface RecordedRequest {
  method: string;
  path: string;
  cookieHeader: string;
}

const SESSION_MAX_AGE_SECONDS = 3600;
const PREFS_MAX_AGE_SECONDS = 31536000;

const startApp = async () => {
  const requests: RecordedRequest[] = [];

  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    const method = request.method ?? "GET";
    const cookieHeader = request.headers.cookie ?? "";

    requests.push({ method, path, cookieHeader });

    const hasCookie = (name: string) => cookieHeader.includes(`${name}=`);
    const isAuthenticated = hasCookie("sid");

    if (path === "/auth/login" && method === "POST") {
      response.writeHead(302, {
        Location: "/app",
        "Set-Cookie": [
          `sid=eyJhbGciOiJIUzI1NiJ9.dXNlcjp0ZXN0; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
          "csrf=9f8b7a3c2e1d; Path=/; SameSite=Strict",
          "prefs=eyJ0aGVtZSI6ImRhcmsiLCJsYW5nIjoiZW4ifQ%3D%3D; Path=/; Max-Age=" +
            PREFS_MAX_AGE_SECONDS,
          "admin_panel=1; Path=/admin; HttpOnly; SameSite=Lax",
        ],
      });
      response.end();
      return;
    }

    if (path === "/app") {
      if (!isAuthenticated) {
        response.writeHead(302, { Location: "/auth/login" });
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<html><body>
        <h1>Dashboard</h1>
        <div id="user-status">authenticated</div>
      </body></html>`);
      return;
    }

    if (path === "/api/me") {
      if (!isAuthenticated) {
        response.writeHead(401, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ user: "testuser", authenticated: true }));
      return;
    }

    if (path === "/api/settings") {
      const prefsMatch = cookieHeader.match(/prefs=([^;]+)/);
      const prefsValue = prefsMatch ? decodeURIComponent(prefsMatch[1]) : null;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ prefs: prefsValue }));
      return;
    }

    if (path === "/auth/login") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<html><body>
        <form method="POST" action="/auth/login">
          <button type="submit" id="login-btn">Log in</button>
        </form>
      </body></html>`);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/html" });
    response.end("<html><body>not found</body></html>");
  });

  const port = await new Promise<number>((resolve) => {
    server.listen(0, "localhost", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });

  return { server, port, requests };
};

const extractCookiesFromContext = async (context: BrowserContext) => {
  const rawCookies = await context.cookies();
  return rawCookies.map((cookie) =>
    Cookie.make({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite === "None" ? "None" : cookie.sameSite === "Lax" ? "Lax" : "Strict",
    }),
  );
};

describe("cookie injection", () => {
  let server: Server;
  let port: number;
  let requests: RecordedRequest[];

  beforeAll(async () => {
    const app = await startApp();
    server = app.server;
    port = app.port;
    requests = app.requests;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe("login flow sets cookies with realistic attributes", () => {
    let browser: Browser;
    let context: BrowserContext;
    let page: Page;

    beforeAll(async () => {
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext();
      page = await context.newPage();
      await page.goto(`http://localhost:${port}/auth/login`);
      await page.click("#login-btn");
      await page.waitForURL(`**/app`);
    });

    afterAll(async () => {
      await browser.close();
    });

    it("redirects to /app after login and lands on authenticated page", async () => {
      expect(page.url()).toBe(`http://localhost:${port}/app`);
      const status = await page.locator("#user-status").textContent();
      expect(status).toBe("authenticated");
    });

    it("stores all Set-Cookie values including HttpOnly and path-scoped", async () => {
      const cookies = await context.cookies();
      const cookieNames = cookies.map((cookie) => cookie.name);
      expect(cookieNames).toContain("sid");
      expect(cookieNames).toContain("csrf");
      expect(cookieNames).toContain("prefs");
      expect(cookieNames).toContain("admin_panel");
    });

    it("preserves cookie attributes from the server", async () => {
      const cookies = await context.cookies();
      const sid = cookies.find((cookie) => cookie.name === "sid");
      expect(sid?.httpOnly).toBe(true);
      expect(sid?.sameSite).toBe("Lax");
      expect(sid?.path).toBe("/");

      const csrf = cookies.find((cookie) => cookie.name === "csrf");
      expect(csrf?.httpOnly).toBe(false);
      expect(csrf?.sameSite).toBe("Strict");

      const adminPanel = cookies.find((cookie) => cookie.name === "admin_panel");
      expect(adminPanel?.path).toBe("/admin");
      expect(adminPanel?.httpOnly).toBe(true);
    });

    it("hides HttpOnly session cookie from document.cookie", async () => {
      const documentCookies = await page.evaluate(() => document.cookie);
      expect(documentCookies).not.toContain("sid=");
      expect(documentCookies).toContain("csrf=9f8b7a3c2e1d");
    });

    it("sends cookies on a fetch() call initiated by page JavaScript", async () => {
      requests.length = 0;

      const apiResponse = await page.evaluate(async () => {
        const response = await fetch("/api/me", { credentials: "same-origin" });
        return response.json();
      });

      expect(apiResponse).toEqual({ user: "testuser", authenticated: true });

      const apiRequest = requests.find((request) => request.path === "/api/me");
      expect(apiRequest?.cookieHeader).toContain("sid=");
    });

    it("sends URL-encoded preference cookie and server decodes it", async () => {
      const settingsResponse = await page.evaluate(async () => {
        const response = await fetch("/api/settings");
        return response.json();
      });

      expect(settingsResponse.prefs).toBe("eyJ0aGVtZSI6ImRhcmsiLCJsYW5nIjoiZW4ifQ==");
    });

    it("sends path-scoped admin cookie only on /admin routes", async () => {
      requests.length = 0;
      await page.evaluate(() => fetch("/admin/users"));

      const adminRequest = requests.find((request) => request.path === "/admin/users");
      expect(adminRequest?.cookieHeader).toContain("admin_panel=1");

      requests.length = 0;
      await page.evaluate(() => fetch("/public"));

      const publicRequest = requests.find((request) => request.path === "/public");
      expect(publicRequest?.cookieHeader).not.toContain("admin_panel");
    });
  });

  describe("cookie migration: new browser context is authenticated", () => {
    it("extracts cookies from browser A, injects into browser B, and B is authenticated", async () => {
      const browserA = await chromium.launch({ headless: true });
      const contextA = await browserA.newContext();
      const pageA = await contextA.newPage();

      await pageA.goto(`http://localhost:${port}/auth/login`);
      await pageA.click("#login-btn");
      await pageA.waitForURL(`**/app`);

      const migrated = await extractCookiesFromContext(contextA);
      await browserA.close();

      expect(migrated.length).toBeGreaterThanOrEqual(4);

      const browserB = await chromium.launch({ headless: true });
      const contextB = await browserB.newContext();
      await injectCookies(contextB, migrated);
      const pageB = await contextB.newPage();

      try {
        await pageB.goto(`http://localhost:${port}/app`);

        expect(pageB.url()).toBe(`http://localhost:${port}/app`);
        const status = await pageB.locator("#user-status").textContent();
        expect(status).toBe("authenticated");

        const apiResponse = await pageB.evaluate(async () => {
          const response = await fetch("/api/me", { credentials: "same-origin" });
          return response.json();
        });
        expect(apiResponse).toEqual({ user: "testuser", authenticated: true });
      } finally {
        await browserB.close();
      }
    });

    it("without migrated cookies, /app redirects to login", async () => {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto(`http://localhost:${port}/app`);
        expect(page.url()).toBe(`http://localhost:${port}/auth/login`);
      } finally {
        await browser.close();
      }
    });
  });

  describe("createPage wires cookie injection end-to-end", () => {
    it("passes cookies through createPage and the server authenticates", async () => {
      const browserA = await chromium.launch({ headless: true });
      const contextA = await browserA.newContext();
      const pageA = await contextA.newPage();
      await pageA.goto(`http://localhost:${port}/auth/login`);
      await pageA.click("#login-btn");
      await pageA.waitForURL(`**/app`);

      const migrated = await extractCookiesFromContext(contextA);
      await browserA.close();

      const result = await createPage(`http://localhost:${port}/app`, { cookies: migrated });

      try {
        expect(result.page.url()).toBe(`http://localhost:${port}/app`);
        const status = await result.page.locator("#user-status").textContent();
        expect(status).toBe("authenticated");
      } finally {
        await result.browser.close();
      }
    });
  });
});
