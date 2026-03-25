import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import {
  BACKGROUND_COLOR,
  FRAMES_PER_STEP,
  GREEN_COLOR,
  MUTED_COLOR,
  OVERLAY_GRADIENT_BOTTOM_PADDING_PX,
  OVERLAY_GRADIENT_HEIGHT_PX,
  OVERLAY_GRADIENT_HORIZONTAL_PADDING_PX,
  RED_COLOR,
  SCENE_TEST_PLAN_DURATION_FRAMES,
  TEST_PLAN_FONT_SIZE_PX,
  TEST_PLAN_INITIAL_DELAY_FRAMES,
  TEST_PLAN_STEPS,
  TEXT_COLOR,
} from "../constants";
import { getBottomOverlayGradient } from "../utils/get-bottom-overlay-gradient";
import { fontFamily } from "../utils/font";

const HEADER_FONT_SIZE_PX = 44;
const HEADER_FADE_FRAMES = 10;
const STEP_FADE_FRAMES = 6;
const INSTRUCTION_FONT_SIZE_PX = 36;

const OVERLAY_START_FRAME = Math.floor(SCENE_TEST_PLAN_DURATION_FRAMES * 0.5);
const OVERLAY_FADE_IN_FRAMES = 15;
const OVERLAY_HOLD_FRAMES = 35;
const OVERLAY_FADE_OUT_FRAMES = 15;
const OVERLAY_END_FRAME =
  OVERLAY_START_FRAME + OVERLAY_FADE_IN_FRAMES + OVERLAY_HOLD_FRAMES + OVERLAY_FADE_OUT_FRAMES;
const OVERLAY_TITLE_FONT_SIZE_PX = 88;

export const TestPlan = () => {
  const frame = useCurrentFrame();

  const headerOpacity = interpolate(frame, [0, HEADER_FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const overlayOpacity = interpolate(
    frame,
    [
      OVERLAY_START_FRAME,
      OVERLAY_START_FRAME + OVERLAY_FADE_IN_FRAMES,
      OVERLAY_END_FRAME - OVERLAY_FADE_OUT_FRAMES,
      OVERLAY_END_FRAME,
    ],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const overlayTitleOpacity = interpolate(
    frame,
    [
      OVERLAY_START_FRAME + 5,
      OVERLAY_START_FRAME + OVERLAY_FADE_IN_FRAMES + 5,
      OVERLAY_END_FRAME - OVERLAY_FADE_OUT_FRAMES - 5,
      OVERLAY_END_FRAME - 5,
    ],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUND_COLOR,
      }}
    >
      <div
        style={{
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
              fontSize: HEADER_FONT_SIZE_PX,
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <span style={{ color: RED_COLOR }}>✗</span>
            <span style={{ color: GREEN_COLOR }}>✓</span>
            <span style={{ color: "white", fontWeight: 700 }}> Expect</span>
          </div>
          <div
            style={{
              fontFamily,
              fontSize: INSTRUCTION_FONT_SIZE_PX,
              color: MUTED_COLOR,
              borderTop: "1px solid rgba(255,255,255,0.15)",
              paddingTop: 12,
            }}
          >
            <span style={{ color: MUTED_COLOR }}>❯ </span>
            <span style={{ color: TEXT_COLOR }}>Verify login, dashboard, and settings work</span>
          </div>
        </div>

        <div
          style={{
            fontFamily,
            fontSize: TEST_PLAN_FONT_SIZE_PX,
            marginTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 16,
          }}
        >
          <div
            style={{
              color: MUTED_COLOR,
              fontSize: 32,
              marginBottom: 16,
              opacity: headerOpacity,
            }}
          >
            Test Plan
          </div>

          {TEST_PLAN_STEPS.map((step, index) => {
            const stepStartFrame = TEST_PLAN_INITIAL_DELAY_FRAMES + index * FRAMES_PER_STEP;
            const localFrame = frame - stepStartFrame;
            const stepOpacity = interpolate(localFrame, [0, STEP_FADE_FRAMES], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });

            return (
              <div
                key={step}
                style={{
                  lineHeight: 1.7,
                  color: TEXT_COLOR,
                  opacity: stepOpacity,
                }}
              >
                <span style={{ color: MUTED_COLOR }}>
                  {"  "}
                  {index + 1}.
                </span>
                <span style={{ color: MUTED_COLOR }}> ● </span>
                {step}
              </div>
            );
          })}
        </div>
      </div>

      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{
            width: "100%",
            height: OVERLAY_GRADIENT_HEIGHT_PX,
            background: getBottomOverlayGradient(overlayOpacity),
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            padding: `0 ${OVERLAY_GRADIENT_HORIZONTAL_PADDING_PX}px ${OVERLAY_GRADIENT_BOTTOM_PADDING_PX}px`,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: OVERLAY_TITLE_FONT_SIZE_PX,
              color: "white",
              opacity: overlayTitleOpacity,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            AI generates a test plan
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
