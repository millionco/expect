import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import {
  BACKGROUND_COLOR,
  EXECUTION_STEP_INTERVAL_FRAMES,
  EXECUTION_STEP_START_FRAME,
  GREEN_COLOR,
  MUTED_COLOR,
  RED_COLOR,
  SPINNER_CHARS,
  SPINNER_SPEED_FRAMES,
  TEST_PLAN_STEPS,
  TEXT_COLOR,
} from "../constants";
import { fontFamily } from "../utils/font";

const HEADER_FADE_FRAMES = 10;
const LOGO_FONT_SIZE_PX = 44;
const INSTRUCTION_FONT_SIZE_PX = 40;
const STEP_FONT_SIZE_PX = 38;
const STATUS_FONT_SIZE_PX = 38;
const STEP_FADE_FRAMES = 8;

export const BrowserExecution = () => {
  const frame = useCurrentFrame();

  const headerOpacity = interpolate(frame, [0, HEADER_FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const completedCount = Math.max(
    0,
    Math.min(
      TEST_PLAN_STEPS.length,
      Math.floor((frame - EXECUTION_STEP_START_FRAME) / EXECUTION_STEP_INTERVAL_FRAMES) + 1,
    ),
  );
  const isExecuting = frame >= EXECUTION_STEP_START_FRAME;
  const allDone = completedCount >= TEST_PLAN_STEPS.length;

  const allDoneFrame =
    EXECUTION_STEP_START_FRAME + TEST_PLAN_STEPS.length * EXECUTION_STEP_INTERVAL_FRAMES;

  const doneOpacity = interpolate(frame, [allDoneFrame, allDoneFrame + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const spinnerChar =
    SPINNER_CHARS[Math.floor(frame / SPINNER_SPEED_FRAMES) % SPINNER_CHARS.length];

  const activeStepIndex = isExecuting && !allDone ? completedCount - 1 : -1;
  const elapsedSeconds = Math.floor(frame / 30);
  const elapsedLabel = `${elapsedSeconds}s`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUND_COLOR,
        padding: "60px 80px",
      }}
    >
      <div
        style={{
          opacity: headerOpacity,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: LOGO_FONT_SIZE_PX,
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <span style={{ color: RED_COLOR }}>✗</span>
          <span style={{ color: GREEN_COLOR }}>✓</span>
          <span style={{ color: "white", fontWeight: 700 }}> Expect</span>
          <span style={{ color: MUTED_COLOR, fontSize: 32, marginLeft: 8 }}>
            ‣ Verify login, dashboard, and settings work
          </span>
        </div>
      </div>

      {!allDone && isExecuting && (
        <div
          style={{
            fontFamily,
            fontSize: STATUS_FONT_SIZE_PX,
            color: MUTED_COLOR,
            marginBottom: 16,
          }}
        >
          <span style={{ color: "#c084fc" }}>{spinnerChar}</span>
          {` Running step ${Math.min(completedCount + 1, TEST_PLAN_STEPS.length)} of ${TEST_PLAN_STEPS.length}... ${elapsedLabel}`}
        </div>
      )}

      {allDone && (
        <div
          style={{
            fontFamily,
            fontSize: STATUS_FONT_SIZE_PX,
            color: GREEN_COLOR,
            marginBottom: 16,
            opacity: doneOpacity,
          }}
        >
          ✓ All steps passed
        </div>
      )}

      <div>
        {TEST_PLAN_STEPS.map((step, index) => {
          const stepCompleteFrame =
            EXECUTION_STEP_START_FRAME + index * EXECUTION_STEP_INTERVAL_FRAMES;
          const localFrame = frame - stepCompleteFrame;
          const itemOpacity = interpolate(localFrame, [0, STEP_FADE_FRAMES], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          const isCompleted = isExecuting && index < completedCount;
          const isActive = index === activeStepIndex && !allDone;
          const isPending = !isCompleted && !isActive;
          const num = `${index + 1}.`;

          const stepElapsedMs = (EXECUTION_STEP_INTERVAL_FRAMES / 30) * 1000;
          const stepElapsedLabel = `${(stepElapsedMs / 1000).toFixed(1)}s`;

          return (
            <div
              key={step}
              style={{
                fontFamily,
                fontSize: STEP_FONT_SIZE_PX,
                lineHeight: 1.7,
                opacity: isPending ? 0.5 : itemOpacity,
              }}
            >
              <span style={{ color: MUTED_COLOR }}>
                {"  "}
                {num}
              </span>
              {isCompleted && (
                <>
                  <span style={{ color: GREEN_COLOR }}> ✓ {step}</span>
                  <span style={{ color: MUTED_COLOR }}> {stepElapsedLabel}</span>
                </>
              )}
              {isActive && (
                <>
                  <span style={{ color: "#c084fc" }}> {spinnerChar}</span>
                  <span style={{ color: TEXT_COLOR }}> {step}</span>
                </>
              )}
              {isPending && (
                <>
                  <span style={{ color: MUTED_COLOR }}> ● {step}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
