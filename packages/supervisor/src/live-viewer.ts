import {
  Effect,
  Layer,
  Option,
  PubSub,
  Schema,
  Stream,
  ServiceMap,
} from "effect";
import type { LiveUpdatePayload } from "@expect/shared/rpcs";
import {
  ExecutedTestPlan,
  PlanId,
  StepId,
  TestPlan,
  TestPlanStep,
  ChangesFor,
} from "@expect/shared/models";
import { Updates } from "./updates";

export class LiveViewer extends ServiceMap.Service<LiveViewer>()(
  "@supervisor/LiveViewer",
  {
    make: Effect.gen(function* () {
      const updates = yield* Updates;
      const pubsub = yield* PubSub.unbounded<LiveUpdatePayload>({
        replay: Infinity,
      });

      // HACK: temporary mock for live viewer testing
      const mockPlan = new TestPlan({
        id: Schema.decodeSync(PlanId)("plan-mock-001"),
        title: "Mock test plan",
        rationale: "Temporary mock for live viewer testing",
        changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
        currentBranch: "main",
        diffPreview: "",
        fileStats: [],
        instruction: "Test all changes",
        baseUrl: Option.none(),
        isHeadless: false,
        requiresCookies: false,
        steps: [
          new TestPlanStep({
            id: Schema.decodeSync(StepId)("step-01"),
            title: "Open the homepage",
            instruction: "Navigate to / and verify it loads",
            expectedOutcome: "Page loads with project list",
            routeHint: Option.some("/"),
            status: "pending",
            summary: Option.none(),
            startedAt: Option.none(),
            endedAt: Option.none(),
          }),
          new TestPlanStep({
            id: Schema.decodeSync(StepId)("step-02"),
            title: "Check project list",
            instruction: "Verify project list is visible",
            expectedOutcome: "Projects are listed on the page",
            routeHint: Option.some("/"),
            status: "pending",
            summary: Option.none(),
            startedAt: Option.none(),
            endedAt: Option.none(),
          }),
        ],
      });
      yield* PubSub.publish(pubsub, {
        _tag: "PlanUpdate",
        plan: new ExecutedTestPlan({ ...mockPlan, events: [] }),
      });

      const push = Effect.fn("LiveViewer.push")(function* (
        payload: LiveUpdatePayload
      ) {
        yield* PubSub.publish(pubsub, payload);
      });

      const stream = Stream.fromPubSub(pubsub);

      /* const updatesStream = yield* updates.stream();
      yield* updatesStream.pipe(
        Stream.tap((update) =>
          PubSub.publish(pubsub, { _tag: "Execution", event: update.content })
        ),
        Stream.runDrain,
        Effect.forkScoped
        ); */

      return { push, stream } as const;
    }),
  }
) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(Updates.layer)
  );
}
