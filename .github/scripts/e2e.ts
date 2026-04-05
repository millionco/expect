import assert from "node:assert/strict";
import { createServer } from "node:http";
import * as path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { TestReport } from "@expect/shared/models";
import { Console, identity, Layer, Stream } from "effect";
import { Reporter, GitRepoRoot } from "@expect/supervisor";
import { RrVideo } from "@expect/browser";
import * as fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WEBSITE_OUT_DIR = path.join(__dirname, "../../apps/website/out");
const CLI_PATH = path.join(__dirname, "../../apps/cli/dist/index.js");
const TIMEOUT_MS = 900_000;
const TEST_CASE = process.env.TEST_CASE ?? "website";
const ARTIFACTS_DIR = `/tmp/test-artifacts/${TEST_CASE}`;

const WEBSITE_INSTRUCTION = `Test the expect.dev marketing website at http://localhost:3000.
Run each item below as a separate test step. If a step fails, record the failure with evidence but continue to the next step.

1. Homepage loads — navigate to http://localhost:3000, verify the page renders with a hero section and install commands visible.
2. View demo — click the "View demo" button/link on the homepage, verify it navigates to /replay?demo=true and the replay player loads with demo content.
3. Replay controls — on the /replay?demo=true page, verify play/pause button works, speed selector is present, and step list is visible.
4. Copy button — go back to the homepage, click the copy button next to the install command, verify the clipboard contains the expected command text.
5. Theme toggle — click the theme toggle to switch to dark mode, verify the background color changes. Switch back to light mode.
6. Footer links — verify the footer contains links to GitHub (github.com/millionco/expect) and X (x.com/aidenybai) with target="_blank".
7. Legal pages — navigate to /terms, /privacy, and /security in sequence. Verify each page loads with text content.
8. Mobile viewport — resize the viewport to 375x812, navigate to the homepage, verify the page renders without horizontal scrollbar and key content is visible.`;

const DOGFOOD_INSTRUCTION = `Visit http://localhost:7681 which shows the expect CLI running in a web terminal (xterm.js). \
This is an interactive terminal UI for a browser testing tool. Test the FULL workflow: \
(1) Verify the TUI renders with a logo/header and input prompt. \
(2) Type a test instruction like 'test the homepage at http://localhost:3000' into the input field and submit it. \
(3) The CLI should generate a test plan — verify the plan review screen appears with test steps. \
(4) Approve the plan (press Enter or the confirm key). \
(5) Watch the execution progress — verify steps are being executed with status updates. \
(6) Wait for completion and verify the results screen shows pass/fail outcomes. \
Note: This is a terminal rendered in xterm.js. Type by clicking the terminal and using keyboard input.`;

const TEST_INSTRUCTION =
  TEST_CASE === "dogfood" ? DOGFOOD_INSTRUCTION : WEBSITE_INSTRUCTION;

const layerServer = Layer.effectDiscard(
  Effect.acquireRelease(
    Effect.promise(() =>
      import("serve-handler").then(({ default: handler }) => {
        const server = createServer((req, res) =>
          handler(req, res, { public: WEBSITE_OUT_DIR })
        );
        return new Promise<typeof server>((resolve) =>
          server.listen(3000, () => resolve(server))
        );
      })
    ),
    (server) =>
      Effect.promise(
        () => new Promise<void>((resolve) => server.close(() => resolve()))
      )
  )
);

const main = Effect.gen(function* () {
  const reporter = yield* Reporter;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const stdout = yield* ChildProcess.make("node", [
    CLI_PATH,
    "--ci",
    "--verbose",
    "--reporter",
    "json",
    "--timeout",
    String(TIMEOUT_MS),
    "--test-id",
    TEST_CASE,
    "-m",
    TEST_INSTRUCTION,
  ]).pipe(
    spawner.streamString,
    Stream.tap((line) => Console.log(line)),
    Stream.runCollect,
    Effect.map((lines) => lines.join("\n"))
  );

  const report = yield* Schema.decodeEffect(TestReport.json)(stdout);

  const resultsDir = "/tmp/expect-results";
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, `${TEST_CASE}.json`), stdout);

  console.log(`\nTest Report: ${report.status}`);
  console.log(`Title: ${report.title}`);
  console.log(`Summary: ${report.summary}`);
  console.log(`Steps: ${report.steps.length}`);
  for (const step of report.steps) {
    const icon =
      step.status === "passed" ? "✓" : step.status === "failed" ? "✗" : "⏭";
    console.log(`  ${icon} ${step.title} (${step.status})`);
  }

  console.log("\nAssertions:");
  assert.ok(
    report.status === "passed" || report.status === "failed",
    "status is passed or failed"
  );
  assert.ok(report.title.length > 0, "title is non-empty");
  assert.ok(report.summary.length > 0, "summary is non-empty");
  assert.ok(report.steps.length > 0, "has at least one step");

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  yield* reporter.exportVideo(report, {
    exportPathOverride: path.join(ARTIFACTS_DIR, `${TEST_CASE}.mp4`),
  });

  yield* report.assertSuccess();
}).pipe(
  Effect.provide(Reporter.layer),
  Effect.provide(RrVideo.layer),
  Effect.provide(Layer.succeed(GitRepoRoot, process.cwd())),
  Effect.provide(NodeServices.layer),
  TEST_CASE === "website" ? Effect.provide(layerServer) : identity
);

NodeRuntime.runMain(main);
