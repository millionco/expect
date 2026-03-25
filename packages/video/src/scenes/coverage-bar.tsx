import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { fontFamily } from "../utils/font";

const BAR_COLOR = "#e06c50";
const BAR_TRACK_COLOR = "#333333";
const BOX_BG_COLOR = "rgba(80, 30, 20, 0.55)";
const BOX_BORDER_COLOR = "rgba(224, 108, 80, 0.3)";
const MUTED_COLOR = "#999999";
const BAR_TOTAL_SEGMENTS = 10;
const TARGET_FILLED_SEGMENTS = 4;
const FILLED_CHAR = "\u2588";
const EMPTY_CHAR = "\u2591";
const TARGET_PERCENT = 38;

const APPEAR_START_FRAME = 8;
const APPEAR_DURATION_FRAMES = 12;
const FILL_START_FRAME = 18;
const FILL_DURATION_FRAMES = 30;
const SUBTITLE_APPEAR_FRAME = 30;
const SUBTITLE_APPEAR_DURATION_FRAMES = 15;

const FONT_SIZE_PX = 44;
const SUBTITLE_FONT_SIZE_PX = 40;
const BOX_PADDING_X_PX = 44;
const BOX_PADDING_Y_PX = 36;
const BOX_RADIUS_PX = 16;

export const CoverageBar = () => {
  const frame = useCurrentFrame();

  const contentOpacity = interpolate(
    frame,
    [APPEAR_START_FRAME, APPEAR_START_FRAME + APPEAR_DURATION_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );
  const contentTranslateY = interpolate(
    frame,
    [APPEAR_START_FRAME, APPEAR_START_FRAME + APPEAR_DURATION_FRAMES],
    [25, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  const fillProgress = interpolate(
    frame,
    [FILL_START_FRAME, FILL_START_FRAME + FILL_DURATION_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  const filledSegments = Math.round(fillProgress * TARGET_FILLED_SEGMENTS);
  const displayPercent = Math.round(fillProgress * TARGET_PERCENT);

  const subtitleOpacity = interpolate(
    frame,
    [SUBTITLE_APPEAR_FRAME, SUBTITLE_APPEAR_FRAME + SUBTITLE_APPEAR_DURATION_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) translateY(${contentTranslateY}px)`,
          opacity: contentOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        <div
          style={{
            backgroundColor: BOX_BG_COLOR,
            border: `2px solid ${BOX_BORDER_COLOR}`,
            borderRadius: BOX_RADIUS_PX,
            paddingLeft: BOX_PADDING_X_PX,
            paddingRight: BOX_PADDING_X_PX,
            paddingTop: BOX_PADDING_Y_PX,
            paddingBottom: BOX_PADDING_Y_PX,
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontFamily,
              fontSize: FONT_SIZE_PX,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: BAR_COLOR }}>⚠</span>
            <span style={{ color: BAR_COLOR, fontWeight: 600 }}>Untested changes</span>

            <span style={{ color: BAR_COLOR, marginLeft: 12 }}>
              {FILLED_CHAR.repeat(filledSegments)}
            </span>
            <span style={{ color: BAR_TRACK_COLOR }}>
              {EMPTY_CHAR.repeat(BAR_TOTAL_SEGMENTS - filledSegments)}
            </span>

            <span
              style={{
                color: BAR_COLOR,
                marginLeft: 12,
              }}
            >
              {displayPercent}% test coverage
            </span>
          </div>

          <div
            style={{
              fontFamily,
              fontSize: SUBTITLE_FONT_SIZE_PX,
              color: MUTED_COLOR,
              lineHeight: 1,
              opacity: subtitleOpacity,
            }}
          >
            Use Expect to test your changes.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
