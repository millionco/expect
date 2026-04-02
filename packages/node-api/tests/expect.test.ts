import { describe, expect, it, beforeEach } from "vite-plus/test";
import { configure, resetGlobalConfig } from "../src/config";
import { expect as expectFn } from "../src/expect";

describe("expect() — target resolution", () => {
  beforeEach(() => {
    resetGlobalConfig();
  });

  it("returns an ExpectChain with toPass method for absolute URL", () => {
    const chain = expectFn("http://localhost:3000/login");
    expect(chain).toHaveProperty("toPass");
    expect(typeof chain.toPass).toBe("function");
  });

  it("returns an ExpectChain for target object", () => {
    configure({ baseUrl: "http://localhost:3000" });
    const chain = expectFn({ url: "/login", data: { email: "test@example.com" } });
    expect(chain).toHaveProperty("toPass");
  });

  it("throws for relative URL without baseUrl", () => {
    expect(() => expectFn("/login")).toThrow("No baseUrl configured");
  });

  it("resolves relative URL when baseUrl is configured", () => {
    configure({ baseUrl: "http://localhost:3000" });
    const chain = expectFn("/login");
    expect(chain).toHaveProperty("toPass");
  });

  it("accepts a duck-typed Playwright page", () => {
    const fakePage = {
      url: () => "http://localhost:3000/dashboard",
      goto: async () => {},
      close: async () => {},
    };
    const chain = expectFn(fakePage);
    expect(chain).toHaveProperty("toPass");
  });

  it("does not treat a target object as a Playwright page", () => {
    configure({ baseUrl: "http://localhost:3000" });
    const target = { url: "/login" };
    const chain = expectFn(target);
    expect(chain).toHaveProperty("toPass");
  });
});

describe("isPlaywrightPage detection", () => {
  it("rejects null", () => {
    expect(() => expectFn(null as never)).toThrow();
  });

  it("throws for object without url property", () => {
    configure({ baseUrl: "http://localhost:3000" });
    const notPage = { goto: async () => {}, close: async () => {} };
    expect(() => expectFn(notPage as never)).toThrow("Expected a URL string");
  });

  it("rejects object where url is a string property not a function", () => {
    configure({ baseUrl: "http://localhost:3000" });
    const target = { url: "/login" };
    const chain = expectFn(target);
    expect(chain).toHaveProperty("toPass");
  });
});
