import { describe, it, expect } from "vite-plus/test";
import { createTestRun } from "../src/test-run";
import type { TestResult, TestEvent } from "../src/types";

const makeResult = (status: "passed" | "failed" = "passed"): TestResult => ({
  status,
  url: "http://localhost:3000",
  duration: 1000,
  steps: [],
  errors: [],
});

describe("createTestRun", () => {
  it("await resolves to TestResult", async () => {
    const result = makeResult();
    const run = createTestRun({
      promise: Promise.resolve(result),
      subscribe: () => (async function* () {})(),
    });

    const awaited = await run;
    expect(awaited).toBe(result);
  });

  it("for await yields TestEvents", async () => {
    const events: TestEvent[] = [
      { type: "step:started", title: "step 1" },
      {
        type: "step:passed",
        step: { title: "step 1", status: "passed", summary: "ok", duration: 100 },
      },
    ];

    let index = 0;
    const run = createTestRun({
      promise: Promise.resolve(makeResult()),
      subscribe: () => {
        const iterator: AsyncIterableIterator<TestEvent> = {
          async next() {
            if (index >= events.length) return { done: true, value: undefined };
            const event = events[index];
            index++;
            return { done: false, value: event };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
        return iterator;
      },
    });

    const collected: TestEvent[] = [];
    for await (const event of run) {
      collected.push(event);
    }

    expect(collected).toHaveLength(2);
    expect(collected[0].type).toBe("step:started");
    expect(collected[1].type).toBe("step:passed");
  });

  it("iterating and awaiting the same TestRun both work", async () => {
    const result = makeResult();
    const events: TestEvent[] = [{ type: "step:started", title: "step 1" }];

    let index = 0;
    const run = createTestRun({
      promise: Promise.resolve(result),
      subscribe: () => {
        const iterator: AsyncIterableIterator<TestEvent> = {
          async next() {
            if (index >= events.length) return { done: true, value: undefined };
            const event = events[index];
            index++;
            return { done: false, value: event };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
        return iterator;
      },
    });

    const collected: TestEvent[] = [];
    for await (const event of run) {
      collected.push(event);
    }
    expect(collected).toHaveLength(1);

    const awaited = await run;
    expect(awaited.status).toBe("passed");
  });
});
