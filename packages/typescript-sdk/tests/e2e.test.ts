import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { Expect } from "../src/expect";
import { configure, resetGlobalConfig } from "../src/config";
import { startFixtureServer } from "./fixtures/fixture-server";
import type { TestEvent } from "../src/types";

let fixtureUrl: string;
let closeServer: () => Promise<void>;

beforeAll(async () => {
  const server = await startFixtureServer();
  fixtureUrl = server.url;
  closeServer = server.close;
});

afterAll(async () => {
  resetGlobalConfig();
  await closeServer();
});

describe("Expect.test e2e", () => {
  it("passes for a page that loads correctly", async () => {
    const result = await Expect.test({
      url: fixtureUrl,
      tests: ["the page loads and shows a heading"],
    });

    expect(result.status).toBe("passed");
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
    expect(result.url).toBe(fixtureUrl);
    expect(result.duration).toBeGreaterThan(0);
  });

  it("streams events via for-await", async () => {
    const run = Expect.test({
      url: fixtureUrl,
      tests: ["the main heading says Welcome"],
    });

    const events: TestEvent[] = [];
    for await (const event of run) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("run:started");

    const result = await run;
    expect(result.status).toBe("passed");
  });

  it("tests the login page has form fields", async () => {
    const result = await Expect.test({
      url: `${fixtureUrl}/login`,
      tests: ["the login page has an email field and a password field"],
    });

    expect(result.status).toBe("passed");
  });

  it("works with configure baseUrl", async () => {
    configure({ baseUrl: fixtureUrl });

    const result = await Expect.test({
      url: "/signup",
      tests: ["the signup page has email, password, and confirm password fields"],
    });

    expect(result.status).toBe("passed");
    resetGlobalConfig();
  });
});

describe("Expect.session e2e", () => {
  it("runs sequential tests in a session", async () => {
    const session = Expect.session({ url: fixtureUrl });

    const homepageResult = await session.test({
      url: fixtureUrl,
      tests: ["the homepage has navigation links"],
    });
    expect(homepageResult.status).toBe("passed");

    const loginResult = await session.test({
      url: `${fixtureUrl}/login`,
      tests: ["the login page has a sign-in form"],
    });
    expect(loginResult.status).toBe("passed");

    await session.close();
  });
});
