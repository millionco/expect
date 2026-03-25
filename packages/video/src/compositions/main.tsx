import { springTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import {
  SCENE_BROWSER_EXECUTION_DURATION_FRAMES,
  SCENE_DIFF_SCAN_DURATION_FRAMES,
  SCENE_RESULTS_DURATION_FRAMES,
  SCENE_TEST_PLAN_DURATION_FRAMES,
  SCENE_TYPING_DURATION_FRAMES,
  TRANSITION_DURATION_FRAMES,
} from "../constants";
import { BrowserExecution } from "../scenes/browser-execution";
import { DiffScan } from "../scenes/diff-scan";
import { Results } from "../scenes/results";
import { TestPlan } from "../scenes/test-plan";
import { TerminalTyping } from "../scenes/terminal-typing";

export const Main = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENE_TYPING_DURATION_FRAMES}>
        <TerminalTyping />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-bottom" })}
        timing={springTiming({
          config: { damping: 200 },
          durationInFrames: TRANSITION_DURATION_FRAMES,
        })}
      />

      <TransitionSeries.Sequence durationInFrames={SCENE_DIFF_SCAN_DURATION_FRAMES}>
        <DiffScan />
      </TransitionSeries.Sequence>

      <TransitionSeries.Sequence durationInFrames={SCENE_TEST_PLAN_DURATION_FRAMES}>
        <TestPlan />
      </TransitionSeries.Sequence>

      <TransitionSeries.Sequence durationInFrames={SCENE_BROWSER_EXECUTION_DURATION_FRAMES}>
        <BrowserExecution />
      </TransitionSeries.Sequence>

      <TransitionSeries.Sequence durationInFrames={SCENE_RESULTS_DURATION_FRAMES}>
        <Results />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
