"use client";

import { useAtom, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { PlanId, type TestPlan } from "@expect/shared/models";
import { testListAtom } from "@/lib/replay/atoms/test-list";
import { selectedTestIdAtom } from "@/lib/replay/atoms/selected-test";

const CONTROL_FONT_FAMILY =
  '"SF Pro Display", "SFProDisplay-Medium", "Inter Variable", system-ui, sans-serif';

export const TestSelector = () => {
  const testList = useAtomValue(testListAtom);
  const [selectedId, setSelectedId] = useAtom(selectedTestIdAtom);

  return AsyncResult.builder(testList)
    .onWaiting(() => (
      <div
        className="flex items-center justify-center p-4 text-sm font-medium text-[color(display-p3_0.587_0.587_0.587)]"
        style={{ fontFamily: CONTROL_FONT_FAMILY }}
      >
        Loading tests...
      </div>
    ))
    .onError((error) => {
      console.error("[TestSelector] onError:", error);
      const message = error instanceof Error ? error.message : JSON.stringify(error, null, 2);
      return (
        <div
          className="flex items-center justify-center p-4 text-sm font-medium text-red-500"
          style={{ fontFamily: CONTROL_FONT_FAMILY }}
        >
          <pre className="whitespace-pre-wrap text-xs">Failed to load tests: {message}</pre>
        </div>
      );
    })
    .onDefect((defect) => {
      console.error("[TestSelector] onDefect:", defect);
      const message = defect instanceof Error ? defect.message : JSON.stringify(defect, null, 2);
      return (
        <div
          className="flex items-center justify-center p-4 text-sm font-medium text-red-500"
          style={{ fontFamily: CONTROL_FONT_FAMILY }}
        >
          <pre className="whitespace-pre-wrap text-xs">Failed to load tests: {message}</pre>
        </div>
      );
    })
    .onSuccess((tests) => {
      if (tests.length === 0) {
        return (
          <div
            className="flex flex-col items-center justify-center gap-2 p-12 text-center"
            style={{ fontFamily: CONTROL_FONT_FAMILY }}
          >
            <span className="text-base font-medium text-[color(display-p3_0.361_0.361_0.361)]">
              No test runs yet
            </span>
            <span className="text-sm text-[color(display-p3_0.587_0.587_0.587)]">
              Run{" "}
              <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">expect</code> to
              create your first test.
            </span>
          </div>
        );
      }
      return (
        <div
          className="flex items-center gap-3 px-6 py-3"
          style={{ fontFamily: CONTROL_FONT_FAMILY }}
        >
          <select
            value={Option.getOrElse(selectedId, () => "")}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedId(value ? Option.some(PlanId.makeUnsafe(value)) : Option.none());
            }}
            className="min-w-0 flex-1 cursor-pointer appearance-none rounded-xl border border-[color(display-p3_0.882_0.882_0.882)] bg-white px-3 py-2 text-sm font-medium text-[color(display-p3_0.188_0.188_0.188)] outline-none"
          >
            <option value="">Select a test run...</option>
            {tests.map((test: TestPlan) => (
              <option key={test.id} value={test.id}>
                {test.title} — {test.steps.length} steps
              </option>
            ))}
          </select>
        </div>
      );
    })
    .render();
};
