import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import {
  BACKGROUND_COLOR,
  DIFF_FILE_FONT_SIZE_PX,
  DIFF_SCAN_INITIAL_DELAY_FRAMES,
  FRAMES_PER_FILE,
  GREEN_COLOR,
  MUTED_COLOR,
  OVERLAY_GRADIENT_BOTTOM_PADDING_PX,
  OVERLAY_GRADIENT_HEIGHT_PX,
  OVERLAY_GRADIENT_HORIZONTAL_PADDING_PX,
  RED_COLOR,
  DIFF_FILES,
  SCENE_DIFF_SCAN_DURATION_FRAMES,
  TEXT_COLOR,
} from "../constants";
import { getBottomOverlayGradient } from "../utils/get-bottom-overlay-gradient";
import { fontFamily } from "../utils/font";

const LINE_HEIGHT_MULTIPLIER = 1.6;
const LINE_HEIGHT_PX = DIFF_FILE_FONT_SIZE_PX * LINE_HEIGHT_MULTIPLIER;
const FADE_IN_FRAMES = 6;
const VIEWPORT_HEIGHT_PX = 1080;
const CONTENT_PADDING_PX = 40;
const USABLE_HEIGHT_PX = VIEWPORT_HEIGHT_PX - CONTENT_PADDING_PX * 2;
const VISIBLE_ROW_COUNT = Math.floor(USABLE_HEIGHT_PX / LINE_HEIGHT_PX);
const TOTAL_LIST_HEIGHT_PX = DIFF_FILES.length * LINE_HEIGHT_PX;
const MAX_SCROLL_PX = Math.max(0, TOTAL_LIST_HEIGHT_PX - USABLE_HEIGHT_PX);
const SCROLL_START_FRAME = DIFF_SCAN_INITIAL_DELAY_FRAMES + VISIBLE_ROW_COUNT * FRAMES_PER_FILE;
const SCROLL_END_FRAME = DIFF_SCAN_INITIAL_DELAY_FRAMES + DIFF_FILES.length * FRAMES_PER_FILE;

const OVERLAY_START_FRAME = Math.floor(SCENE_DIFF_SCAN_DURATION_FRAMES * 0.25);
const OVERLAY_FADE_IN_FRAMES = 15;
const OVERLAY_HOLD_FRAMES = 60;
const OVERLAY_FADE_OUT_FRAMES = 15;
const OVERLAY_END_FRAME =
  OVERLAY_START_FRAME + OVERLAY_FADE_IN_FRAMES + OVERLAY_HOLD_FRAMES + OVERLAY_FADE_OUT_FRAMES;
const TITLE_FONT_SIZE_PX = 88;

export const DiffScan = () => {
  const frame = useCurrentFrame();

  const scrollY = interpolate(frame, [SCROLL_START_FRAME, SCROLL_END_FRAME], [0, MAX_SCROLL_PX], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
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

  const titleOpacity = interpolate(
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
          width: "100%",
          height: "100%",
          overflow: "hidden",
          padding: `${CONTENT_PADDING_PX}px 60px`,
        }}
      >
        <div style={{ transform: `translateY(-${scrollY}px)` }}>
          {DIFF_FILES.map((file, index) => {
            const fileStartFrame = DIFF_SCAN_INITIAL_DELAY_FRAMES + index * FRAMES_PER_FILE;
            const localFrame = frame - fileStartFrame;
            const fileOpacity = interpolate(localFrame, [0, FADE_IN_FRAMES], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });

            return (
              <div
                key={file.path}
                style={{
                  opacity: fileOpacity,
                  fontFamily,
                  fontSize: DIFF_FILE_FONT_SIZE_PX,
                  lineHeight: LINE_HEIGHT_MULTIPLIER,
                  color: TEXT_COLOR,
                  whiteSpace: "nowrap",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>
                  <span style={{ color: MUTED_COLOR }}>{String(index + 1).padStart(2, " ")} </span>
                  <span>{file.path}</span>
                </span>
                <span>
                  <span style={{ color: GREEN_COLOR }}>+{file.added}</span>
                  {"  "}
                  <span style={{ color: RED_COLOR }}>-{file.removed}</span>
                </span>
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
              fontSize: TITLE_FONT_SIZE_PX,
              color: "white",
              opacity: titleOpacity,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            Scan your changes
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
