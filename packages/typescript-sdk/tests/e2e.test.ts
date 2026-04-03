import { Expect } from "../src/expect";
import { configure, resetGlobalConfig } from "../src/config";
import { startFixtureServer } from "./fixtures/fixture-server";
import type { TestEvent } from "../src/types";

const server = await startFixtureServer();
const fixtureUrl = server.url;

console.log(`Fixture server started at ${fixtureUrl}`);

try {
  console.log("\n--- test: page loads correctly ---");
  const basic = await Expect.test({
    url: fixtureUrl,
    tests: ["the page loads and shows a heading"],
  });
  console.log(`Status: ${basic.status} (${basic.steps.length} steps)`);
  for (const step of basic.steps) {
    console.log(`  ${step.status === "passed" ? "✅" : "❌"} ${step.title}`);
  }
  if (basic.status !== "passed") throw new Error("basic test failed");

  console.log("\n--- test: streaming events ---");
  const run = Expect.test({
    url: fixtureUrl,
    tests: ["the main heading says Welcome"],
  });
  const events: TestEvent[] = [];
  for await (const event of run) {
    events.push(event);
    if (event.type === "step:passed") console.log(`  ✅ ${event.step.title}`);
    if (event.type === "step:failed") console.log(`  ❌ ${event.step.title}`);
  }
  const streamResult = await run;
  console.log(`Status: ${streamResult.status} (${events.length} events)`);
  if (events.length === 0) throw new Error("no events received");

  console.log("\n--- test: login page ---");
  const loginResult = await Expect.test({
    url: `${fixtureUrl}/login`,
    tests: ["the login page has an email field and a password field"],
  });
  console.log(`Status: ${loginResult.status}`);

  console.log("\n--- test: configure baseUrl ---");
  configure({ baseUrl: fixtureUrl });
  const signupResult = await Expect.test({
    url: "/signup",
    tests: ["the signup page has email, password, and confirm password fields"],
  });
  console.log(`Status: ${signupResult.status}`);
  resetGlobalConfig();

  console.log("\n--- test: session ---");
  const session = Expect.session({ url: fixtureUrl });
  const homeResult = await session.test({
    url: fixtureUrl,
    tests: ["the homepage has navigation links"],
  });
  console.log(`Home: ${homeResult.status}`);
  const sessionLoginResult = await session.test({
    url: `${fixtureUrl}/login`,
    tests: ["the login page has a sign-in form"],
  });
  console.log(`Login: ${sessionLoginResult.status}`);
  await session.close();

  const allPassed = [
    basic,
    streamResult,
    loginResult,
    signupResult,
    homeResult,
    sessionLoginResult,
  ].every((result) => result.status === "passed");

  console.log(`\nAll passed: ${allPassed}`);
  process.exit(allPassed ? 0 : 1);
} finally {
  await server.close();
}
