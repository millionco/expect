import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import {
  BACKGROUND_COLOR,
  GREEN_COLOR,
  MUTED_COLOR,
  RESULTS_ANIMATION_FRAMES,
  RESULTS_ELAPSED_TIME,
  RESULTS_STEP_COUNT,
  TEXT_COLOR,
} from "../constants";
import { fontFamily } from "../utils/font";

const LOGO_FONT_SIZE_PX = 48;
const STATUS_FONT_SIZE_PX = 96;
const DETAIL_FONT_SIZE_PX = 56;
const REPLAY_FONT_SIZE_PX = 36;
const REPLAY_DELAY_FRAMES = 30;
const REPLAY_FADE_FRAMES = 10;

export const Results = () => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, RESULTS_ANIMATION_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const scaleY = interpolate(frame, [0, RESULTS_ANIMATION_FRAMES], [0.95, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const replayOpacity = interpolate(
    frame,
    [REPLAY_DELAY_FRAMES, REPLAY_DELAY_FRAMES + REPLAY_FADE_FRAMES],
    [0, 1],
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
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          opacity: fadeIn,
          transform: `scale(${scaleY})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: LOGO_FONT_SIZE_PX,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ color: "#f87171" }}>✗</span>
          <span style={{ color: GREEN_COLOR }}>✓</span>
          <span style={{ color: "white", fontWeight: 700 }}> Expect</span>
        </div>

        <div
          style={{
            fontFamily,
            fontSize: STATUS_FONT_SIZE_PX,
            color: GREEN_COLOR,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <span>✓</span>
          <span>Passed</span>
        </div>

        <div
          style={{
            fontFamily,
            fontSize: DETAIL_FONT_SIZE_PX,
            color: TEXT_COLOR,
            display: "flex",
            gap: 32,
          }}
        >
          <span>
            <span style={{ color: GREEN_COLOR }}>{RESULTS_STEP_COUNT}</span>
            <span style={{ color: MUTED_COLOR }}>/{RESULTS_STEP_COUNT} steps</span>
          </span>
          <span style={{ color: MUTED_COLOR }}>·</span>
          <span style={{ color: MUTED_COLOR }}>{RESULTS_ELAPSED_TIME}</span>
        </div>

        <div
          style={{
            fontFamily,
            fontSize: REPLAY_FONT_SIZE_PX,
            color: MUTED_COLOR,
            opacity: replayOpacity,
            marginTop: 16,
          }}
        >
          Replay:{" "}
          <span style={{ color: "white", fontWeight: 500 }}>expect.dev/replay/a1b2c3d4</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
