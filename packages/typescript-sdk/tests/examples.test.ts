import { describe, it, expect, beforeEach } from "vite-plus/test";
import { configure, resetGlobalConfig } from "../src/config";
import { resolveUrl, buildInstruction } from "../src/build-instruction";
import { Expect } from "../src/expect";

describe("example patterns — validation only", () => {
  beforeEach(() => {
    resetGlobalConfig();
  });

  it("basic: resolves absolute url", () => {
    const url = resolveUrl("http://localhost:3000", undefined);
    expect(url).toBe("http://localhost:3000/");
  });

  it("auth: configure baseUrl resolves relative urls", () => {
    configure({ baseUrl: "http://localhost:3000" });
    const loginUrl = resolveUrl("/login", "http://localhost:3000");
    const signupUrl = resolveUrl("/signup", "http://localhost:3000");
    expect(loginUrl).toBe("http://localhost:3000/login");
    expect(signupUrl).toBe("http://localhost:3000/signup");
  });

  it("session: creates session with test and close methods", () => {
    const session = Expect.session({ url: "http://localhost:3000" });
    expect(typeof session.test).toBe("function");
    expect(typeof session.close).toBe("function");
    expect(typeof session[Symbol.asyncDispose]).toBe("function");
  });

  it("instruction: builds numbered test list", () => {
    const instruction = buildInstruction("http://localhost:3000/login", [
      "signing in with valid credentials redirects to the dashboard",
      "the dashboard shows the user's name",
    ]);
    expect(instruction).toContain("1. signing in");
    expect(instruction).toContain("2. the dashboard");
    expect(instruction).toContain("http://localhost:3000/login");
  });

  it("cookies: Expect.cookies is callable", () => {
    expect(typeof Expect.cookies).toBe("function");
  });
});
