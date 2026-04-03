import type { TestResult, TestEvent, TestRun } from "./types";

interface TestRunCallbacks {
  readonly promise: Promise<TestResult>;
  readonly subscribe: () => AsyncIterableIterator<TestEvent>;
}

export const createTestRun = (callbacks: TestRunCallbacks): TestRun => ({
  then<TResult1 = TestResult, TResult2 = never>(
    onfulfilled?: ((value: TestResult) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return callbacks.promise.then(onfulfilled, onrejected);
  },

  [Symbol.asyncIterator](): AsyncIterator<TestEvent> {
    return callbacks.subscribe();
  },
});
