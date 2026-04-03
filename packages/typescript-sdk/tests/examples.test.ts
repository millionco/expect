import { describe, it, expect, beforeEach } from "vite-plus/test";
import { Expect } from "../src/expect";
import { configure, resetGlobalConfig } from "../src/config";

describe("examples — input validation only (no agent needed)", () => {
  beforeEach(() => {
    resetGlobalConfig();
  });

  it("basic: accepts absolute url + tests", () => {
    const run = Expect.test({
      url: "http://localhost:3000",
      tests: ["the page loads without errors", "the main heading is visible"],
    });
    expect(run).toBeDefined();
    expect(typeof run.then).toBe("function");
    expect(typeof run[Symbol.asyncIterator]).toBe("function");
  });

  it("auth: configure baseUrl + multiple test calls", () => {
    configure({ baseUrl: "http://localhost:3000" });

    const login = Expect.test({
      url: "/login",
      tests: ["submitting empty form shows validation errors"],
    });
    const signup = Expect.test({
      url: "/signup",
      tests: ["signup form has email field"],
    });

    expect(login).toBeDefined();
    expect(signup).toBeDefined();
  });

  it("session: creates session and returns test method", () => {
    const session = Expect.session({
      url: "http://localhost:3000",
      cookies: "chrome",
    });

    expect(typeof session.test).toBe("function");
    expect(typeof session.close).toBe("function");

    const run = session.test({
      url: "/login",
      tests: ["login form renders"],
    });
    expect(run).toBeDefined();
  });

  it("streaming: test run is async iterable", () => {
    const run = Expect.test({
      url: "http://localhost:3000/login",
      tests: ["signing in redirects to dashboard"],
    });

    expect(Symbol.asyncIterator in run).toBe(true);
  });

  it("playwright-setup: accepts page option", () => {
    const fakePage = { url: () => "http://localhost:3000/dashboard" };

    const run = Expect.test({
      page: fakePage as never,
      tests: ["dashboard shows welcome message"],
    });
    expect(run).toBeDefined();
  });
});
