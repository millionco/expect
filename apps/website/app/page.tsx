"use client";

import { useRef, useLayoutEffect, useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { berkeleyMonoRegular, restartHardRegular, testSignifierRegular } from "@/app/fonts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { motion, AnimatePresence, useMotionValue } from "motion/react";
import { useSound } from "@/hooks/use-sound";
import { clickSoftSound } from "@/lib/click-soft";
import { drawKnife1Sound } from "@/lib/draw-knife-1";
import { switchOffSound } from "@/lib/switch-off";
import { switchOnSound } from "@/lib/switch-on";
import { useWebHaptics } from "web-haptics/react";
import { cn } from "@/lib/utils";

/** Loading ring geometry: smaller radius than r=9; stroke width stays 2.65 in user units. */
const SPINNER_R = 5.75;
/** Scaled from the old 20/40 dash pattern so arc proportion matches r=9. */
const SPINNER_DASH = (20 * SPINNER_R) / 9;
const SPINNER_GAP = (40 * SPINNER_R) / 9;
const SPINNER_CIRCUMFERENCE = 2 * Math.PI * SPINNER_R;

/** Spinner/check settle timing after the field finishes typing. */
const FIRST_FIELD_POST_TYPE_CHECK_DELAY_MS = 150;
const LOAD_SEQUENCE_FADE_MS = 220;
const TERMINAL_ROW_INDICATOR_DELAY_MS = 45;
const INPUT_STATUS_EXIT_RING_GROW_DURATION_S = 0.5;

/** Same green as the Paper checkmark — used in the late spinner morph + final success state. */
const TERMINAL_SUCCESS_GREEN = "#27C840";
const TERMINAL_FAILURE_RED = "#FC272F";
const TERMINAL_FAILURE_RED_DARK = "color(display-p3 1 0.447 0.369)";
const TERMINAL_SPINNER_TRACK = "#E3E3E3";
const TERMINAL_SPINNER_ACTIVE = "#8E8E8E";
/** Stroke width for the terminal loading ring (viewBox units). */
const TERMINAL_SPINNER_STROKE = 2.1;
const TERMINAL_STEP_LABEL_BASE_CLASS =
  "relative w-fit h-4.5 [letter-spacing:0em] font-bold shrink-0 text-[13px]/4.5";

function getFailureColor(isDark: boolean) {
  return isDark ? TERMINAL_FAILURE_RED_DARK : TERMINAL_FAILURE_RED;
}

const CURSOR_ART_WIDTH = 39;
const CURSOR_ART_HEIGHT = 41;
const CURSOR_HOTSPOT_X = 19;
const CURSOR_HOTSPOT_Y = 16;
const BUTTON_CURSOR_RENDER_WIDTH = 23;
const BUTTON_CURSOR_RENDER_HEIGHT = 28;
const BUTTON_CURSOR_RENDER_LEFT = 2;
const BUTTON_CURSOR_RENDER_TOP = 4;
const CURSOR_TARGET_RIGHT_INSET_X = 72;
const SECOND_FIELD_CURSOR_TARGET_RIGHT_INSET_X = 84;
const SUBMIT_BUTTON_CURSOR_TARGET_RIGHT_INSET_X = 34;
const MOBILE_VIEWPORT_MAX_WIDTH_PX = 639;
const MOBILE_CURSOR_TARGET_LEFT_INSET_X = 32;
const MOBILE_SECOND_FIELD_CURSOR_TARGET_LEFT_INSET_X = 32;
const CURSOR_TOP_START_X = 82;
const CURSOR_TOP_START_Y = 28;
const CURSOR_MOVE_DELAY_S = 0.24;
const CURSOR_MOVE_DURATION_S = 0.5;
const CURSOR_FIELD_PRESS_SCALE = 0.935;
const CURSOR_BUTTON_PRESS_SCALE = 0.94;
const CURSOR_PRESS_TRANSITION_DURATION_S = 0.08;
const CURSOR_FIELD_PRESS_RELEASE_DELAY_MS = 44;
const CURSOR_ARC_LIFT_Y = 38;
const CURSOR_PATH_SAMPLE_COUNT = 17;
const CURSOR_START_ROTATE = -7;
const SHARED_TERMINAL_INDICATOR_CLASS = "relative flex size-6 shrink-0 items-center justify-center";
const TERMINAL_KNIFE_SOUND_VOLUME = 0.45;
const FIRST_FIELD_VALUE = "foo@bar.xyz";
const SECOND_FIELD_VALUE = "••••••••";
const SECOND_FIELD_SUBMIT_READY_LENGTH = 4;
const FIRST_FIELD_FOCUS_DELAY_MS = 55;
const FIRST_FIELD_TYPE_AFTER_FOCUS_DELAY_MS = 340;
const FIRST_FIELD_TYPE_STEP_MS = 32;
const TERMINAL_NEXT_ROW_DELAY_MS = 95;
const FIRST_FIELD_FOCUS_PULSE_SCALE = 0.99;
const FIRST_FIELD_FOCUS_PULSE_DURATION_S = 0.1;
const FIRST_FIELD_TOUCH_EARLY_PX = 3;
const SECOND_FIELD_MOVE_AFTER_DISMISS_DELAY_MS = 110;
const SECOND_FIELD_MOVE_DURATION_S = 0.32;
const SUBMIT_BUTTON_MOVE_AFTER_SUCCESS_DELAY_MS = 140;
const SUBMIT_BUTTON_PRESS_AFTER_TOUCH_DELAY_MS = 90;
const SUBMIT_BUTTON_MOVE_DURATION_S = 0.46;
const SUBMIT_BUTTON_PRESS_HOLD_MS = 120;
const SUBMIT_BUTTON_PRESS_SCALE = 0.965;
const SUBMIT_SEQUENCE_FADE_MS = LOAD_SEQUENCE_FADE_MS + 40;
const REDIRECT_STEP_START_DELAY_MS = 320;
const REDIRECT_FAILURE_MORPH_HOLD_MS = 280;
const AUTO_REPLAY_DELAY_MS = 1000;
const FIRST_FIELD_IDLE_SHADOW =
  "color(display-p3 0 0 0 / 16%) 0px 0px 0px 0.5px, color(display-p3 0 0 0 / 3%) 0px 1px 5px";
const FIRST_FIELD_FOCUS_SHADOW =
  "color(display-p3 0 0 0 / 18%) 0px 0px 0px 0.75px, color(display-p3 0 0 0 / 4%) 0px 1px 5px";
const CURSOR_INDICATOR_SUCCESS_DISMISS_DELAY_MS = 90;

type CursorTravel = {
  pathX: number[];
  pathY: number[];
  pathRotate: number[];
  pathTimes: number[];
  endX: number;
  endY: number;
};

type CursorTravels = {
  first: CursorTravel;
  second: CursorTravel;
  third: CursorTravel;
};

type FieldBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function clampNumber(value: number, min: number, max: number) {
  if (max <= min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function cubicBezierPoint(
  start: number,
  control1: number,
  control2: number,
  end: number,
  t: number,
) {
  const invT = 1 - t;
  return (
    invT * invT * invT * start +
    3 * invT * invT * t * control1 +
    3 * invT * t * t * control2 +
    t * t * t * end
  );
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

type TerminalSpinnerPhase = "loading" | "morph" | "success";
type TerminalStepIndicatorPhase = TerminalSpinnerPhase | "idle";

function getTerminalStepPhase({
  showLoading,
  morphReady,
  successReady,
}: {
  showLoading: boolean;
  morphReady: boolean;
  successReady: boolean;
}): TerminalStepIndicatorPhase {
  if (successReady) {
    return "success";
  }
  if (morphReady) {
    return "morph";
  }
  if (showLoading) {
    return "loading";
  }
  return "idle";
}

function buildCursorTravel(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  maxX: number,
  maxY: number,
): CursorTravel {
  const clampedStartX = clampNumber(startX, 0, maxX);
  const clampedStartY = clampNumber(startY, 0, maxY);
  const clampedEndX = clampNumber(endX, 0, maxX);
  const clampedEndY = clampNumber(endY, 0, maxY);
  const deltaX = clampedEndX - clampedStartX;
  const deltaY = clampedEndY - clampedStartY;
  const control1X = clampNumber(clampedStartX + Math.max(deltaX * 0.18, 12), 0, maxX);
  const control1Y = clampNumber(clampedStartY - CURSOR_ARC_LIFT_Y * 0.46, 0, maxY);
  const control2X = clampNumber(clampedStartX + deltaX * 0.74, 0, maxX);
  const control2Y = clampNumber(clampedStartY + deltaY * 0.36 - CURSOR_ARC_LIFT_Y * 0.12, 0, maxY);
  const pathTimes = Array.from(
    { length: CURSOR_PATH_SAMPLE_COUNT },
    (_, index) => index / (CURSOR_PATH_SAMPLE_COUNT - 1),
  );
  const pathProgress = pathTimes.map((time) => easeOutCubic(time));

  return {
    pathTimes,
    pathX: pathProgress.map((progress) =>
      cubicBezierPoint(clampedStartX, control1X, control2X, clampedEndX, progress),
    ),
    pathY: pathProgress.map((progress) =>
      cubicBezierPoint(clampedStartY, control1Y, control2Y, clampedEndY, progress),
    ),
    pathRotate: pathTimes.map(
      (time) =>
        CURSOR_START_ROTATE + (0 - CURSOR_START_ROTATE) * easeOutCubic(Math.min(time / 0.88, 1)),
    ),
    endX: clampedEndX,
    endY: clampedEndY,
  };
}

function buildCursorDropTravel(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  maxX: number,
  maxY: number,
): CursorTravel {
  const clampedStartX = clampNumber(startX, 0, maxX);
  const clampedStartY = clampNumber(startY, 0, maxY);
  const clampedEndX = clampNumber(endX, 0, maxX);
  const clampedEndY = clampNumber(endY, 0, maxY);
  const pathTimes = Array.from(
    { length: CURSOR_PATH_SAMPLE_COUNT },
    (_, index) => index / (CURSOR_PATH_SAMPLE_COUNT - 1),
  );
  const pathProgress = pathTimes.map((time) => easeOutCubic(time));

  return {
    pathTimes,
    pathX: pathProgress.map((progress) => clampedStartX + (clampedEndX - clampedStartX) * progress),
    pathY: pathProgress.map((progress) => clampedStartY + (clampedEndY - clampedStartY) * progress),
    pathRotate: pathTimes.map(() => 0),
    endX: clampedEndX,
    endY: clampedEndY,
  };
}

function getFieldBounds(fieldRect: DOMRect, stageRect: DOMRect): FieldBounds {
  return {
    left: fieldRect.left - stageRect.left,
    right: fieldRect.right - stageRect.left,
    top: fieldRect.top - stageRect.top,
    bottom: fieldRect.bottom - stageRect.top,
  };
}

/** Shared loading → morph → check indicator used by the terminal steps. */
function TerminalSyncSpinner({
  phase,
  className,
  successColor = TERMINAL_SUCCESS_GREEN,
  successIcon = "check",
  loadingCircleFull = false,
  showLoading = true,
  animateInitialSuccess = false,
  isDark = false,
}: {
  phase: TerminalSpinnerPhase;
  className?: string;
  successColor?: string;
  successIcon?: "check" | "close";
  loadingCircleFull?: boolean;
  showLoading?: boolean;
  animateInitialSuccess?: boolean;
  isDark?: boolean;
}) {
  const failureColor = getFailureColor(isDark);

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-visible pointer-events-none",
        className,
      )}
      aria-hidden="true"
    >
      {showLoading ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transformOrigin: "center center", willChange: "opacity, transform" }}
        >
          <div
            style={{
              transformOrigin: "center center",
              willChange: "transform",
              animationPlayState: "running",
            }}
            className="terminal-spinner-rotate flex size-full items-center justify-center"
          >
            <svg viewBox="0 0 24 24" className="size-full">
              <circle
                cx="12"
                cy="12"
                r={SPINNER_R}
                fill="none"
                strokeWidth={TERMINAL_SPINNER_STROKE}
                style={{
                  stroke: isDark ? "#3A3A3A" : TERMINAL_SPINNER_TRACK,
                  opacity: 0.95,
                }}
              />
              <motion.circle
                cx="12"
                cy="12"
                r={SPINNER_R}
                fill="none"
                strokeWidth={TERMINAL_SPINNER_STROKE}
                strokeLinecap="round"
                initial={false}
                animate={{
                  strokeDasharray: loadingCircleFull
                    ? `${SPINNER_CIRCUMFERENCE} 0`
                    : `${SPINNER_DASH} ${SPINNER_GAP}`,
                  stroke: loadingCircleFull
                    ? successColor
                    : isDark
                      ? "#707070"
                      : TERMINAL_SPINNER_ACTIVE,
                }}
                transition={
                  loadingCircleFull
                    ? {
                        duration: INPUT_STATUS_EXIT_RING_GROW_DURATION_S,
                        stroke: {
                          duration: 0.16,
                          ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                        },
                        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                      }
                    : {
                        duration: 0,
                        stroke: { duration: 0 },
                      }
                }
                style={{
                  opacity: 0.98,
                }}
              />
            </svg>
          </div>
        </div>
      ) : null}
      <AnimatePresence initial={animateInitialSuccess}>
        {phase === "success" ? (
          <motion.div
            key="success-check"
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transformOrigin: "center center",
              willChange: "opacity, transform",
            }}
            initial={{
              opacity: 0,
              scale: 0.8,
            }}
            animate={{
              opacity: 1,
              scale: 1,
            }}
            exit={{
              opacity: 0,
            }}
            transition={{
              opacity: {
                duration: 0.08,
                ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
              },
              scale: {
                type: "spring",
                stiffness: 500,
                damping: 18,
                mass: 0.55,
              },
            }}
          >
            {successIcon === "close" ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                color={failureColor}
                fill="none"
                style={{
                  width: "18px",
                  height: "18px",
                  flexShrink: 0,
                }}
              >
                <path
                  d="M12 1.25C17.937 1.25 22.75 6.063 22.75 12C22.75 17.937 17.937 22.75 12 22.75C6.063 22.75 1.25 17.937 1.25 12C1.25 6.063 6.063 1.25 12 1.25ZM9.631 8.225C9.238 7.904 8.659 7.927 8.293 8.293C7.927 8.659 7.904 9.238 8.225 9.631L8.293 9.707L10.586 12L8.294 14.293C7.904 14.684 7.903 15.317 8.294 15.707C8.684 16.097 9.318 16.097 9.708 15.707L12 13.414L14.292 15.707L14.368 15.775C14.761 16.096 15.34 16.073 15.706 15.707C16.072 15.341 16.095 14.762 15.775 14.369L15.706 14.293L13.413 12L15.707 9.707L15.775 9.631C16.096 9.238 16.073 8.659 15.707 8.293C15.341 7.927 14.762 7.904 14.369 8.225L14.293 8.293L12 10.586L9.707 8.293L9.631 8.225Z"
                  fill={failureColor}
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                color={successColor}
                fill="none"
                style={{ width: "75%", height: "75%" }}
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M1.25 12C1.25 17.937 6.063 22.75 12 22.75C17.937 22.75 22.75 17.937 22.75 12C22.75 6.063 17.937 1.25 12 1.25C6.063 1.25 1.25 6.063 1.25 12ZM16.676 8.263C17.083 8.636 17.11 9.269 16.737 9.676L11.237 15.676C11.053 15.877 10.794 15.994 10.522 16C10.249 16.006 9.986 15.9 9.793 15.707L7.293 13.207C6.902 12.817 6.902 12.183 7.293 11.793C7.683 11.402 8.317 11.402 8.707 11.793L10.469 13.554L15.263 8.324C15.636 7.917 16.269 7.89 16.676 8.263Z"
                  fill={successColor}
                />
              </svg>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function InputCaret({ visible }: { visible: boolean }) {
  return (
    <motion.div
      className="ml-px h-[15px] w-px shrink-0 rounded-full bg-[color(display-p3_0.24_0.24_0.24/72%)] dark:bg-[color(display-p3_0.82_0.82_0.82/72%)]"
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{
        opacity: {
          duration: 0.08,
          ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
        },
      }}
      style={{
        boxShadow: "color(display-p3 0 0 0 / 6%) 0px 0px 0px 0.25px",
      }}
      aria-hidden="true"
    />
  );
}

function TerminalStepCheck({
  phase,
  successColor = TERMINAL_SUCCESS_GREEN,
  successIcon = "check",
  isDark = false,
}: {
  phase: TerminalStepIndicatorPhase;
  successColor?: string;
  successIcon?: "check" | "close";
  isDark?: boolean;
}) {
  return (
    <div className={SHARED_TERMINAL_INDICATOR_CLASS} aria-hidden="true">
      {phase === "success" ? (
        <TerminalSyncSpinner
          phase="success"
          className="size-full"
          successColor={successColor}
          successIcon={successIcon}
          showLoading={false}
          animateInitialSuccess
          isDark={isDark}
        />
      ) : phase === "loading" || phase === "morph" ? (
        <TerminalSyncSpinner
          phase={phase}
          className="size-full"
          successColor={successColor}
          successIcon={successIcon}
          loadingCircleFull={phase === "morph"}
          isDark={isDark}
        />
      ) : null}
    </div>
  );
}

function TerminalStepLabel({
  complete,
  showStrikeThrough = true,
  className,
  children,
}: {
  complete: boolean;
  showStrikeThrough?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        berkeleyMonoRegular.className,
        TERMINAL_STEP_LABEL_BASE_CLASS,
        "text-[color(display-p3_0.195_0.195_0.195)] dark:text-[color(display-p3_0.881_0.881_0.881)]",
        className,
      )}
    >
      {children}
      {showStrikeThrough ? (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-[54%] z-10 h-px rounded-full bg-current"
          initial={false}
          animate={{
            scaleX: complete ? 1 : 0,
            opacity: complete ? 1 : 0,
          }}
          transition={{
            scaleX: {
              duration: complete ? 0.22 : 0.14,
              ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
            },
            opacity: {
              duration: complete ? 0.04 : 0.1,
              ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
            },
          }}
          style={{
            transformOrigin: "left center",
            willChange: "transform, opacity",
          }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function SignUpErrorCallout({ isDark = false }: { isDark?: boolean }) {
  return (
    <div
      className={cn(
        restartHardRegular.className,
        "size-fit whitespace-nowrap [letter-spacing:0em] text-[13px]/5.25",
      )}
      style={{
        color: isDark ? TERMINAL_FAILURE_RED_DARK : "#E30000",
        fontVariationSettings: '"CONN" 50, "wght" 400, "ital" 0',
      }}
    >
      Error
    </div>
  );
}

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useMountEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  });
  useEffect(() => {
    if (theme && theme !== "light" && theme !== "dark") {
      setTheme("light");
    }
  }, [theme, setTheme]);

  const currentTheme = theme === "dark" ? "dark" : "light";
  const isDark = mounted && currentTheme === "dark";

  const fieldIdleShadow = isDark
    ? "color(display-p3 1 1 1 / 8%) 0px 0px 0px 0.5px"
    : FIRST_FIELD_IDLE_SHADOW;
  const fieldFocusShadow = isDark
    ? "color(display-p3 1 1 1 / 12%) 0px 0px 0px 0.75px"
    : FIRST_FIELD_FOCUS_SHADOW;
  const containerOutlineColor = isDark
    ? "color(display-p3 1 1 1 / 8%)"
    : "color(display-p3 0 0 0 / 16%)";
  const mobileContainerOutlineShadow = `inset 0 -0.5px 0 0 ${containerOutlineColor}, inset 0.5px 0 0 0 ${containerOutlineColor}, inset -0.5px 0 0 0 ${containerOutlineColor}`;
  const desktopContainerOutlineShadow = `inset 0 0 0 0.5px ${containerOutlineColor}`;

  const stagger = (i: number) => ({
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.08, delay: i * 0.04, ease: [0.25, 0.1, 0.25, 1] as const },
  });

  const mainContainerRef = useRef<HTMLDivElement>(null);
  const terminalKnifeAudioRef = useRef<HTMLAudioElement | null>(null);
  const terminalKnifeSoundLastPlayAtRef = useRef(0);
  const cursorStageRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLDivElement>(null);
  const secondFieldRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLDivElement>(null);
  const firstEditableInputRef = useRef<HTMLInputElement>(null);
  const secondEditableInputRef = useRef<HTMLInputElement>(null);
  const [cursorTravels, setCursorTravels] = useState<CursorTravels | null>(null);
  const [firstFieldBounds, setFirstFieldBounds] = useState<FieldBounds | null>(null);
  const [secondFieldBounds, setSecondFieldBounds] = useState<FieldBounds | null>(null);
  const [submitButtonBounds, setSubmitButtonBounds] = useState<FieldBounds | null>(null);
  const [firstFieldTouched, setFirstFieldTouched] = useState(false);
  const [typedFieldLength, setTypedFieldLength] = useState(0);
  const [secondFieldTouched, setSecondFieldTouched] = useState(false);
  const [secondTypedFieldLength, setSecondTypedFieldLength] = useState(0);
  const [submitButtonTouched, setSubmitButtonTouched] = useState(false);
  const [terminalLabelDismissed, setTerminalLabelDismissed] = useState(false);
  const [terminalDragging, setTerminalDragging] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [cursorFieldPressScale, setCursorFieldPressScale] = useState(1);
  const [firstFieldUnlocked, setFirstFieldUnlocked] = useState(false);
  const [secondFieldUnlocked, setSecondFieldUnlocked] = useState(false);
  const pendingFocusFieldRef = useRef<"first" | "second" | null>(null);
  const [editableFocusedField, setEditableFocusedField] = useState<"first" | "second" | null>(null);
  const [editableFirstFieldValue, setEditableFirstFieldValue] = useState("");
  const [editableSecondFieldValue, setEditableSecondFieldValue] = useState("");
  const [animationRunId, setAnimationRunId] = useState(0);
  const terminalOffsetX = useMotionValue(0);
  const terminalOffsetY = useMotionValue(0);

  useMountEffect(() => {
    const element = new Audio(drawKnife1Sound.dataUri);
    element.preload = "auto";
    element.volume = TERMINAL_KNIFE_SOUND_VOLUME;
    terminalKnifeAudioRef.current = element;
    return () => {
      element.pause();
      terminalKnifeAudioRef.current = null;
    };
  });

  const playTerminalDrawKnife = () => {
    const now = Date.now();
    if (now - terminalKnifeSoundLastPlayAtRef.current < 150) return;
    terminalKnifeSoundLastPlayAtRef.current = now;
    const element = terminalKnifeAudioRef.current;
    if (!element) return;
    element.volume = TERMINAL_KNIFE_SOUND_VOLUME;
    element.currentTime = 0;
    void element.play().catch(() => {});
  };

  const firstFieldFocused = useDelayedFlag(
    firstFieldTouched,
    FIRST_FIELD_FOCUS_DELAY_MS,
    animationRunId,
  );
  const firstFieldTypingReady = useDelayedFlag(
    firstFieldFocused,
    FIRST_FIELD_TYPE_AFTER_FOCUS_DELAY_MS,
    animationRunId,
  );
  const firstFieldTypingComplete = typedFieldLength >= FIRST_FIELD_VALUE.length;
  const terminalIndicatorMorphReady = useDelayedFlag(
    firstFieldTouched && firstFieldTypingComplete,
    FIRST_FIELD_POST_TYPE_CHECK_DELAY_MS,
    animationRunId,
  );
  const terminalIndicatorSuccessReady = useDelayedFlag(
    terminalIndicatorMorphReady,
    LOAD_SEQUENCE_FADE_MS,
    animationRunId,
  );
  const terminalRowIndicatorSuccessReady = useDelayedFlag(
    terminalIndicatorSuccessReady,
    TERMINAL_ROW_INDICATOR_DELAY_MS,
    animationRunId,
  );
  const cursorIndicatorSuccessDismissed = useDelayedFlag(
    terminalRowIndicatorSuccessReady,
    TERMINAL_NEXT_ROW_DELAY_MS + CURSOR_INDICATOR_SUCCESS_DISMISS_DELAY_MS,
    animationRunId,
  );
  const cursorStageIsSecond = useDelayedFlag(
    cursorIndicatorSuccessDismissed,
    SECOND_FIELD_MOVE_AFTER_DISMISS_DELAY_MS,
    animationRunId,
  );
  const secondFieldFocused = useDelayedFlag(
    secondFieldTouched,
    FIRST_FIELD_FOCUS_DELAY_MS,
    animationRunId,
  );
  const secondFieldTypingReady = useDelayedFlag(
    secondFieldFocused,
    FIRST_FIELD_TYPE_AFTER_FOCUS_DELAY_MS,
    animationRunId,
  );
  const secondFieldTypingComplete = secondTypedFieldLength >= SECOND_FIELD_VALUE.length;
  const passwordCursorIndicatorMorphReady = useDelayedFlag(
    secondFieldTouched && secondFieldTypingComplete,
    FIRST_FIELD_POST_TYPE_CHECK_DELAY_MS,
    animationRunId,
  );
  const passwordCursorIndicatorSuccessReady = useDelayedFlag(
    passwordCursorIndicatorMorphReady,
    LOAD_SEQUENCE_FADE_MS,
    animationRunId,
  );
  const passwordTerminalIndicatorMorphReady = useDelayedFlag(
    passwordCursorIndicatorMorphReady,
    TERMINAL_ROW_INDICATOR_DELAY_MS,
    animationRunId,
  );
  const passwordTerminalIndicatorSuccessReady = useDelayedFlag(
    passwordCursorIndicatorSuccessReady,
    TERMINAL_ROW_INDICATOR_DELAY_MS,
    animationRunId,
  );
  const cursorStageIsThird = useDelayedFlag(
    passwordTerminalIndicatorSuccessReady && cursorStageIsSecond,
    SUBMIT_BUTTON_MOVE_AFTER_SUCCESS_DELAY_MS,
    animationRunId,
  );
  const submitPressStarted = useDelayedFlag(
    submitButtonTouched,
    SUBMIT_BUTTON_PRESS_AFTER_TOUCH_DELAY_MS,
    animationRunId,
  );
  const submitButtonClicked = useDelayedFlag(
    submitPressStarted,
    SUBMIT_BUTTON_PRESS_HOLD_MS,
    animationRunId,
  );
  const submitButtonPressed = submitPressStarted && !submitButtonClicked;
  const submitTerminalIndicatorMorphReady = useDelayedFlag(
    submitButtonClicked,
    FIRST_FIELD_POST_TYPE_CHECK_DELAY_MS,
    animationRunId,
  );
  const submitTerminalIndicatorSuccessReady = useDelayedFlag(
    submitTerminalIndicatorMorphReady,
    SUBMIT_SEQUENCE_FADE_MS,
    animationRunId,
  );
  const redirectStepStarted = useDelayedFlag(
    submitTerminalIndicatorSuccessReady,
    REDIRECT_STEP_START_DELAY_MS,
    animationRunId,
  );
  const redirectTerminalIndicatorMorphReady = useDelayedFlag(
    redirectStepStarted,
    REDIRECT_FAILURE_MORPH_HOLD_MS,
    animationRunId,
  );
  const redirectTerminalIndicatorSuccessReady = useDelayedFlag(
    redirectTerminalIndicatorMorphReady,
    LOAD_SEQUENCE_FADE_MS,
    animationRunId,
  );
  const cursorMoveStage = cursorStageIsThird ? "third" : cursorStageIsSecond ? "second" : "first";
  const typedFieldValue = FIRST_FIELD_VALUE.slice(0, typedFieldLength);
  const secondTypedFieldValue = SECOND_FIELD_VALUE.slice(0, secondTypedFieldLength);
  const firstFieldInputActive = firstFieldUnlocked || redirectTerminalIndicatorSuccessReady;
  const secondFieldInputActive = secondFieldUnlocked || redirectTerminalIndicatorSuccessReady;
  const displayedFirstFieldValue = firstFieldUnlocked ? editableFirstFieldValue : typedFieldValue;
  const displayedSecondFieldValue = secondFieldUnlocked
    ? editableSecondFieldValue
    : secondTypedFieldValue;
  const submitPillReady =
    (secondFieldInputActive ? displayedSecondFieldValue.length : secondTypedFieldLength) >=
    SECOND_FIELD_SUBMIT_READY_LENGTH;
  const firstFieldVisuallyFocused = firstFieldInputActive
    ? editableFocusedField === "first"
    : firstFieldFocused && !secondFieldFocused;
  const secondFieldVisuallyFocused = secondFieldInputActive
    ? editableFocusedField === "second"
    : secondFieldFocused && !submitButtonClicked;
  const activeCursorTravel = cursorTravels
    ? cursorMoveStage === "third"
      ? cursorTravels.third
      : cursorMoveStage === "second"
        ? cursorTravels.second
        : cursorTravels.first
    : null;
  const cursorMoveDurationS =
    cursorMoveStage === "third"
      ? SUBMIT_BUTTON_MOVE_DURATION_S
      : cursorMoveStage === "second"
        ? SECOND_FIELD_MOVE_DURATION_S
        : CURSOR_MOVE_DURATION_S;
  const cursorMoveDelayS = cursorMoveStage === "first" ? CURSOR_MOVE_DELAY_S : 0;
  const terminalFormStepComplete = passwordTerminalIndicatorSuccessReady;
  const terminalSubmitStepComplete = submitTerminalIndicatorSuccessReady;
  const terminalRedirectStepComplete = redirectTerminalIndicatorSuccessReady;
  const showTextCursor = firstFieldTouched && cursorMoveStage !== "third";
  const showSubmitButtonIndicator =
    cursorMoveStage === "third" && !submitTerminalIndicatorSuccessReady;
  const showRedirectStepIndicator = redirectStepStarted && !redirectTerminalIndicatorSuccessReady;
  const showSignUpErrorCallout = redirectStepStarted;
  const autoReplayReady = useDelayedFlag(
    redirectTerminalIndicatorSuccessReady,
    AUTO_REPLAY_DELAY_MS,
    animationRunId,
  );
  const cursorInteractionScale = submitButtonPressed
    ? CURSOR_BUTTON_PRESS_SCALE
    : cursorFieldPressScale;
  const showFirstFieldCaret = !firstFieldInputActive && firstFieldVisuallyFocused;
  const showSecondFieldCaret = !secondFieldInputActive && secondFieldVisuallyFocused;
  const showButtonCursor = cursorMoveStage === "third";
  const formTerminalStepPhase = getTerminalStepPhase({
    showLoading: !passwordTerminalIndicatorMorphReady && !passwordTerminalIndicatorSuccessReady,
    morphReady: passwordTerminalIndicatorMorphReady,
    successReady: passwordTerminalIndicatorSuccessReady,
  });
  const submitTerminalStepPhase = getTerminalStepPhase({
    showLoading: showSubmitButtonIndicator,
    morphReady: submitTerminalIndicatorMorphReady,
    successReady: terminalSubmitStepComplete,
  });
  const redirectTerminalStepPhase = getTerminalStepPhase({
    showLoading: showRedirectStepIndicator,
    morphReady: redirectTerminalIndicatorMorphReady,
    successReady: terminalRedirectStepComplete,
  });

  useLayoutEffect(() => {
    const field = pendingFocusFieldRef.current;
    if (!field) return;
    const targetInput =
      field === "first" ? firstEditableInputRef.current : secondEditableInputRef.current;
    if (!targetInput) return;
    pendingFocusFieldRef.current = null;
    targetInput.focus();
    if (["text", "search", "url", "tel", "password"].includes(targetInput.type)) {
      const cursorPosition = targetInput.value.length;
      targetInput.setSelectionRange(cursorPosition, cursorPosition);
    }
  });

  useEffect(() => {
    if (!autoReplayReady || terminalDragging) return;
    const replayTimer = window.setTimeout(() => {
      firstEditableInputRef.current?.blur();
      secondEditableInputRef.current?.blur();
      setCursorTravels(null);
      setFirstFieldBounds(null);
      setSecondFieldBounds(null);
      setSubmitButtonBounds(null);
      setFirstFieldTouched(false);
      setTypedFieldLength(0);
      setSecondFieldTouched(false);
      setSecondTypedFieldLength(0);
      setSubmitButtonTouched(false);
      setTerminalDragging(false);
      setCursorFieldPressScale(1);
      setFirstFieldUnlocked(false);
      setSecondFieldUnlocked(false);
      pendingFocusFieldRef.current = null;
      setEditableFocusedField(null);
      setEditableFirstFieldValue("");
      setEditableSecondFieldValue("");
      terminalKnifeSoundLastPlayAtRef.current = 0;
      setAnimationRunId((current) => current + 1);
    }, 0);
    return () => {
      window.clearTimeout(replayTimer);
    };
  }, [autoReplayReady, terminalDragging]);

  useEffect(() => {
    if (!firstFieldFocused) return;
    const pressTimer = window.setTimeout(() => {
      setCursorFieldPressScale(CURSOR_FIELD_PRESS_SCALE);
    }, 0);
    const releaseTimer = window.setTimeout(() => {
      setCursorFieldPressScale(1);
    }, CURSOR_FIELD_PRESS_RELEASE_DELAY_MS);
    return () => {
      window.clearTimeout(pressTimer);
      window.clearTimeout(releaseTimer);
    };
  }, [firstFieldFocused]);

  useEffect(() => {
    if (!firstFieldTypingReady || firstFieldTypingComplete) return;
    const previousCharacter = FIRST_FIELD_VALUE[typedFieldLength - 1];
    const nextDelay =
      typedFieldLength === 0
        ? 0
        : FIRST_FIELD_TYPE_STEP_MS +
          (previousCharacter === "@" || previousCharacter === "." ? 18 : 0);
    const typingTimer = window.setTimeout(() => {
      setTypedFieldLength((currentLength) => Math.min(currentLength + 1, FIRST_FIELD_VALUE.length));
    }, nextDelay);
    return () => {
      window.clearTimeout(typingTimer);
    };
  }, [firstFieldTypingReady, firstFieldTypingComplete, typedFieldLength]);

  useEffect(() => {
    if (!secondFieldFocused) return;
    const pressTimer = window.setTimeout(() => {
      setCursorFieldPressScale(CURSOR_FIELD_PRESS_SCALE);
    }, 0);
    const releaseTimer = window.setTimeout(() => {
      setCursorFieldPressScale(1);
    }, CURSOR_FIELD_PRESS_RELEASE_DELAY_MS);
    return () => {
      window.clearTimeout(pressTimer);
      window.clearTimeout(releaseTimer);
    };
  }, [secondFieldFocused]);

  useEffect(() => {
    if (!secondFieldTypingReady || secondFieldTypingComplete) return;
    const nextDelay = secondTypedFieldLength === 0 ? 0 : FIRST_FIELD_TYPE_STEP_MS;
    const typingTimer = window.setTimeout(() => {
      setSecondTypedFieldLength((currentLength) =>
        Math.min(currentLength + 1, SECOND_FIELD_VALUE.length),
      );
    }, nextDelay);
    return () => {
      window.clearTimeout(typingTimer);
    };
  }, [secondFieldTypingReady, secondFieldTypingComplete, secondTypedFieldLength]);

  useLayoutEffect(() => {
    const mainContainer = mainContainerRef.current;
    const stage = cursorStageRef.current;
    const firstField = firstFieldRef.current;
    const secondField = secondFieldRef.current;
    const submitButton = submitButtonRef.current;
    if (!stage || !firstField || !secondField || !submitButton) return;

    const measure = () => {
      const stageRect = stage.getBoundingClientRect();
      const firstFieldRect = firstField.getBoundingClientRect();
      const secondFieldRect = secondField.getBoundingClientRect();
      const submitButtonRect = submitButton.getBoundingClientRect();
      const mobileViewport = window.matchMedia(
        `(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH_PX}px)`,
      ).matches;
      const maxX = Math.max(stageRect.width - CURSOR_ART_WIDTH, 0);
      const maxY = Math.max(stageRect.height - CURSOR_ART_HEIGHT, 0);
      const startX = clampNumber(CURSOR_TOP_START_X, 0, maxX);
      const startY = clampNumber(CURSOR_TOP_START_Y, 0, maxY);

      setIsMobileViewport(mobileViewport);
      const getFieldTarget = (
        fieldRect: DOMRect,
        insetX: number,
        side: "left" | "right" = "right",
      ) => {
        const endHotspotX =
          side === "left"
            ? fieldRect.left - stageRect.left + insetX
            : fieldRect.right - stageRect.left - insetX;
        const endHotspotY = fieldRect.top - stageRect.top + fieldRect.height * 0.5;

        return {
          endX: clampNumber(endHotspotX - CURSOR_HOTSPOT_X, 0, maxX),
          endY: clampNumber(endHotspotY - CURSOR_HOTSPOT_Y, 0, maxY),
        };
      };

      const firstTarget = mobileViewport
        ? getFieldTarget(firstFieldRect, MOBILE_CURSOR_TARGET_LEFT_INSET_X, "left")
        : getFieldTarget(firstFieldRect, CURSOR_TARGET_RIGHT_INSET_X);
      const secondTarget = mobileViewport
        ? getFieldTarget(secondFieldRect, MOBILE_SECOND_FIELD_CURSOR_TARGET_LEFT_INSET_X, "left")
        : getFieldTarget(secondFieldRect, SECOND_FIELD_CURSOR_TARGET_RIGHT_INSET_X);
      const submitTarget = getFieldTarget(
        submitButtonRect,
        SUBMIT_BUTTON_CURSOR_TARGET_RIGHT_INSET_X,
      );
      const firstTravel = buildCursorTravel(
        startX,
        startY,
        firstTarget.endX,
        firstTarget.endY,
        maxX,
        maxY,
      );
      const secondTravel = buildCursorDropTravel(
        firstTravel.endX,
        firstTravel.endY,
        secondTarget.endX,
        secondTarget.endY,
        maxX,
        maxY,
      );
      const thirdTravel = buildCursorDropTravel(
        secondTravel.endX,
        secondTravel.endY,
        submitTarget.endX,
        submitTarget.endY,
        maxX,
        maxY,
      );

      setCursorTravels({ first: firstTravel, second: secondTravel, third: thirdTravel });
      setFirstFieldBounds(getFieldBounds(firstFieldRect, stageRect));
      setSecondFieldBounds(getFieldBounds(secondFieldRect, stageRect));
      setSubmitButtonBounds(getFieldBounds(submitButtonRect, stageRect));
    };

    let scheduledFrame = 0;
    const scheduleMeasure = () => {
      if (scheduledFrame) {
        cancelAnimationFrame(scheduledFrame);
      }
      scheduledFrame = requestAnimationFrame(() => {
        scheduledFrame = 0;
        measure();
      });
    };

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        raf2 = 0;
        measure();
      });
    });
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(stage);
    resizeObserver.observe(firstField);
    resizeObserver.observe(secondField);
    resizeObserver.observe(submitButton);
    if (mainContainer) {
      resizeObserver.observe(mainContainer);
    }
    const visualViewport = window.visualViewport;
    window.addEventListener("resize", scheduleMeasure);
    visualViewport?.addEventListener("resize", scheduleMeasure);
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      visualViewport?.removeEventListener("resize", scheduleMeasure);
    };
  }, [animationRunId]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-start px-5 pt-0 sm:pt-20 bg-[linear-gradient(180deg,#FFFFFF_0%,rgb(247,247,247)_100%)] dark:bg-[radial-gradient(ellipse_at_center,rgb(14,14,14)_0%,#000000_100%)]">
      <div
        key={animationRunId}
        ref={mainContainerRef}
        className="relative -mx-5 flex h-91.5 w-[calc(100%+2.5rem)] max-w-none items-start justify-start overflow-hidden rounded-none sm:mx-0 sm:w-164.5 sm:max-w-none sm:items-center sm:justify-center sm:overflow-visible sm:rounded-2xl"
      >
        <div
          className="pointer-events-none absolute inset-0 hidden rounded-2xl sm:block"
          style={{
            backgroundImage: isDark
              ? "linear-gradient(in oklab 180deg, oklab(16% 0 0) 0%, oklab(6% 0 0 / 0%) 100%)"
              : "linear-gradient(in oklab 180deg, oklab(95.5% 0 0) 0%, oklab(100% 0 0 / 0%) 100%)",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-none sm:hidden"
          style={{
            boxShadow: mobileContainerOutlineShadow,
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 hidden rounded-2xl sm:block"
          style={{
            boxShadow: desktopContainerOutlineShadow,
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
          }}
          aria-hidden="true"
        />
        <div className="absolute top-5 left-1/2 h-76.75 w-[31.03125rem] -translate-x-1/2 sm:relative sm:top-auto sm:left-auto sm:translate-x-0 sm:translate-y-5">
          <div className="relative h-76.75 w-full sm:w-93.25">
            <div
              className={cn(
                "pointer-events-none absolute inset-0 overflow-hidden rounded-2xl",
                !isDark && "[box-shadow:color(display-p3_1_1_1)_0px_0px_9px_inset]",
              )}
              style={{
                backgroundImage: isDark
                  ? "linear-gradient(in oklab 180deg, oklab(17% 0 0) 0%, oklab(17% 0 0) 82.16%, oklab(17% 0 0 / 0%) 100%)"
                  : "linear-gradient(in oklab 180deg, oklab(100% 0 0 / 65%) 0%, oklab(99% 0 0) 82.16%, oklab(100% 0 0) 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 0%, black 68%, transparent 100%)",
                maskImage: "linear-gradient(to bottom, black 0%, black 68%, transparent 100%)",
              }}
            />
            <div className="absolute top-3.5 left-3.5 hidden items-start gap-[5.5px] p-0 size-fit sm:flex">
              <div className="rounded-full bg-[#D8D8D8] dark:bg-[#444444] shrink-0 size-2.5" />
              <div className="rounded-full bg-[#D8D8D8] dark:bg-[#444444] shrink-0 size-2.5" />
              <div className="rounded-full bg-[#D8D8D8] dark:bg-[#444444] shrink-0 size-2.5" />
            </div>
            {/* from Paper — https://app.paper.design/file/01KKVJZGYDH7NE03PKQE86N5EK?page=01KMAQWMFAADNQS52G7NJNERWY&node=J0T-0 (Mar 23, 2026) */}
            <div
              className="absolute left-[82.75px] flex flex-col items-start sm:left-[29px]"
              style={{ top: "calc(0.875rem + 0.625rem + 76px)" }}
            >
              <div className="tracking-[-0.01em] text-black dark:text-[color(display-p3_0.92_0.92_0.92)] font-['IvarTextTRIAL-Italic','Ivar_Text_TRIAL',system-ui,sans-serif] italic text-[17.5px]/6.25 size-fit">
                Sign up
              </div>
              <div className="mt-[17px] flex flex-col items-start gap-[9px]">
                {/* from Paper — https://app.paper.design/file/01KKVJZGYDH7NE03PKQE86N5EK?page=01KMAQWMFAADNQS52G7NJNERWY&node=J0U-0 (Mar 23, 2026) */}
                <motion.div
                  ref={firstFieldRef}
                  className="relative w-49.5 h-7.5 rounded-full flex items-center px-3 py-1.5 bg-[color(display-p3_1_1_1/0%)] transition-[background-color] duration-150"
                  onPointerDownCapture={() => {
                    if (firstFieldInputActive) return;
                    setFirstFieldTouched(true);
                    setFirstFieldUnlocked(true);
                    setEditableFirstFieldValue(typedFieldValue);
                    pendingFocusFieldRef.current = "first";
                  }}
                  initial={false}
                  animate={
                    firstFieldVisuallyFocused
                      ? {
                          scale: [1, FIRST_FIELD_FOCUS_PULSE_SCALE, 1],
                          boxShadow: [fieldIdleShadow, fieldFocusShadow, fieldFocusShadow],
                        }
                      : {
                          scale: 1,
                          boxShadow: fieldIdleShadow,
                        }
                  }
                  transition={{
                    duration: FIRST_FIELD_FOCUS_PULSE_DURATION_S,
                    times: [0, 0.45, 1],
                    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                  }}
                  style={{
                    backgroundColor: firstFieldTouched
                      ? isDark
                        ? "color(display-p3 0.13 0.13 0.13)"
                        : "color(display-p3 1 1 1)"
                      : undefined,
                    transformOrigin: "center center",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    {firstFieldInputActive ? (
                      <input
                        ref={firstEditableInputRef}
                        aria-label="Email"
                        type="email"
                        value={displayedFirstFieldValue}
                        onChange={(event) => {
                          setFirstFieldUnlocked(true);
                          setEditableFirstFieldValue(event.currentTarget.value);
                        }}
                        onFocus={() => {
                          setEditableFocusedField("first");
                        }}
                        onBlur={() => {
                          setEditableFocusedField((currentField) =>
                            currentField === "first" ? null : currentField,
                          );
                        }}
                        autoComplete="email"
                        spellCheck={false}
                        className={`${restartHardRegular.className} block w-full min-w-0 border-0 bg-transparent p-0 [letter-spacing:0em] text-[color(display-p3_0.317_0.317_0.317)] dark:text-[color(display-p3_0.75_0.75_0.75)] text-sm/4.5 outline-none`}
                      />
                    ) : typedFieldLength > 0 || showFirstFieldCaret ? (
                      <div className="flex min-w-0 items-center">
                        <div
                          className={`${restartHardRegular.className} min-w-0 max-w-full h-4.5 overflow-hidden text-ellipsis [letter-spacing:0em] text-[color(display-p3_0.317_0.317_0.317)] dark:text-[color(display-p3_0.75_0.75_0.75)] text-sm/4.5 whitespace-nowrap`}
                        >
                          {typedFieldValue}
                        </div>
                        <InputCaret visible={showFirstFieldCaret} />
                      </div>
                    ) : null}
                  </div>
                </motion.div>
                {/* from Paper — https://app.paper.design/file/01KKVJZGYDH7NE03PKQE86N5EK?page=01KMAQWMFAADNQS52G7NJNERWY&node=J0W-0 (Mar 23, 2026) */}
                <motion.div
                  ref={secondFieldRef}
                  className="relative w-49.5 h-7.5 rounded-full flex items-center px-3 py-1.5 bg-[color(display-p3_1_1_1/0%)] transition-[background-color] duration-150"
                  onPointerDownCapture={() => {
                    if (secondFieldInputActive) return;
                    setSecondFieldTouched(true);
                    setSecondFieldUnlocked(true);
                    setEditableSecondFieldValue(secondTypedFieldValue);
                    pendingFocusFieldRef.current = "second";
                  }}
                  initial={false}
                  animate={
                    secondFieldVisuallyFocused
                      ? {
                          scale: [1, FIRST_FIELD_FOCUS_PULSE_SCALE, 1],
                          boxShadow: [fieldIdleShadow, fieldFocusShadow, fieldFocusShadow],
                        }
                      : {
                          scale: 1,
                          boxShadow: fieldIdleShadow,
                        }
                  }
                  transition={{
                    duration: FIRST_FIELD_FOCUS_PULSE_DURATION_S,
                    times: [0, 0.45, 1],
                    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                  }}
                  style={{
                    backgroundColor: secondFieldTouched
                      ? isDark
                        ? "color(display-p3 0.13 0.13 0.13)"
                        : "color(display-p3 1 1 1)"
                      : undefined,
                    transformOrigin: "center center",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    {secondFieldUnlocked ? (
                      <input
                        ref={secondEditableInputRef}
                        aria-label="Password"
                        type="password"
                        value={displayedSecondFieldValue}
                        onChange={(event) => {
                          setSecondFieldUnlocked(true);
                          setEditableSecondFieldValue(event.currentTarget.value);
                        }}
                        onFocus={() => {
                          setEditableFocusedField("second");
                        }}
                        onBlur={() => {
                          setEditableFocusedField((currentField) =>
                            currentField === "second" ? null : currentField,
                          );
                        }}
                        autoComplete="off"
                        spellCheck={false}
                        className={`${restartHardRegular.className} block w-full min-w-0 border-0 bg-transparent p-0 [letter-spacing:0em] text-[color(display-p3_0.317_0.317_0.317)] dark:text-[color(display-p3_0.75_0.75_0.75)] text-sm/4.5 outline-none`}
                      />
                    ) : secondTypedFieldLength > 0 || showSecondFieldCaret ? (
                      <div className="flex min-w-0 items-center">
                        <div
                          className={`${restartHardRegular.className} min-w-0 max-w-full h-4.5 overflow-hidden text-ellipsis [letter-spacing:0em] text-[color(display-p3_0.317_0.317_0.317)] dark:text-[color(display-p3_0.75_0.75_0.75)] text-sm/4.5 whitespace-nowrap`}
                        >
                          {secondTypedFieldValue}
                        </div>
                        <InputCaret visible={showSecondFieldCaret} />
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              </div>
              {/* from Paper — https://app.paper.design/file/01KKVJZGYDH7NE03PKQE86N5EK?page=01KMAQWMFAADNQS52G7NJNERWY&node=J0Y-0 (Mar 23, 2026) */}
              <div className="relative mt-[13px] w-fit">
                <AnimatePresence>
                  {showSignUpErrorCallout ? (
                    <motion.div
                      key="sign-up-error"
                      className="pointer-events-none absolute top-1/2 z-0 w-fit -translate-y-1/2"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{
                        duration: 0.18,
                        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                      }}
                      style={{
                        left: "calc(100% + 10px)",
                        willChange: "transform, opacity",
                      }}
                    >
                      <SignUpErrorCallout isDark={isDark} />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <motion.div
                  ref={submitButtonRef}
                  className={cn(
                    "w-fit h-6.25 rounded-full flex items-center px-3 py-1.25 transition-[background-color] duration-150",
                    submitPillReady
                      ? "bg-[color(display-p3_0.267_0.503_0.967)]"
                      : "bg-[color(display-p3_0.910_0.910_0.910)] dark:bg-[color(display-p3_0.22_0.22_0.22)]",
                  )}
                  initial={false}
                  animate={{
                    scale: submitButtonPressed ? SUBMIT_BUTTON_PRESS_SCALE : 1,
                    y: submitButtonPressed ? 1 : 0,
                  }}
                  transition={{
                    duration: 0.1,
                    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                  }}
                  style={{ transformOrigin: "center center" }}
                >
                  <div className="w-10.75 h-1.75 rounded-full bg-[color(display-p3_1_1_1/30%)] shrink-0" />
                </motion.div>
              </div>
            </div>
            <div
              ref={cursorStageRef}
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              {cursorTravels && activeCursorTravel ? (
                <motion.div
                  className="[font-synthesis:none] absolute left-0 top-0 z-10 h-[41px] w-[39px] antialiased"
                  initial={{
                    x: cursorTravels.first.pathX[0],
                    y: cursorTravels.first.pathY[0],
                    rotate: cursorTravels.first.pathRotate[0],
                    scale: 1,
                  }}
                  animate={{
                    x: activeCursorTravel.pathX,
                    y: activeCursorTravel.pathY,
                    rotate: activeCursorTravel.pathRotate,
                    scale: cursorInteractionScale,
                  }}
                  transition={{
                    x: {
                      duration: cursorMoveDurationS,
                      delay: cursorMoveDelayS,
                      times: activeCursorTravel.pathTimes,
                      ease: "linear",
                    },
                    y: {
                      duration: cursorMoveDurationS,
                      delay: cursorMoveDelayS,
                      times: activeCursorTravel.pathTimes,
                      ease: "linear",
                    },
                    rotate: {
                      duration: cursorMoveDurationS * 0.98,
                      delay: cursorMoveDelayS,
                      times: activeCursorTravel.pathTimes,
                      ease: "linear",
                    },
                    scale: {
                      duration: CURSOR_PRESS_TRANSITION_DURATION_S,
                      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                    },
                  }}
                  onUpdate={(latest) => {
                    const targetBounds =
                      cursorMoveStage === "third"
                        ? submitButtonBounds
                        : cursorMoveStage === "second"
                          ? secondFieldBounds
                          : firstFieldBounds;
                    const targetTouched =
                      cursorMoveStage === "third"
                        ? submitButtonTouched
                        : cursorMoveStage === "second"
                          ? secondFieldTouched
                          : firstFieldTouched;
                    if (targetTouched || !targetBounds) return;
                    const touchEarlyPx =
                      cursorMoveStage === "first" ? FIRST_FIELD_TOUCH_EARLY_PX : 0;

                    const x = typeof latest.x === "number" ? latest.x : activeCursorTravel.endX;
                    const y = typeof latest.y === "number" ? latest.y : activeCursorTravel.endY;
                    const cursorTipX = x + CURSOR_HOTSPOT_X;
                    const cursorTipY = y + CURSOR_HOTSPOT_Y;

                    if (
                      cursorTipX >= targetBounds.left - touchEarlyPx &&
                      cursorTipX <= targetBounds.right + touchEarlyPx &&
                      cursorTipY >= targetBounds.top - touchEarlyPx &&
                      cursorTipY <= targetBounds.bottom + touchEarlyPx
                    ) {
                      if (cursorMoveStage === "third") {
                        setSubmitButtonTouched(true);
                        return;
                      }

                      if (cursorMoveStage === "second") {
                        setSecondFieldTouched(true);
                        return;
                      }

                      setFirstFieldTouched(true);
                    }
                  }}
                  style={{
                    transformOrigin: `${CURSOR_HOTSPOT_X}px ${CURSOR_HOTSPOT_Y}px`,
                    willChange: "transform",
                  }}
                >
                  {showTextCursor ? (
                    <svg
                      className="absolute z-10"
                      width="32"
                      height="32"
                      viewBox="0 0 32 32"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{
                        width: "39px",
                        height: "39px",
                        top: "1px",
                        left: "0px",
                        position: "absolute",
                      }}
                    >
                      <defs>
                        <filter
                          id="cursor-text-shadow"
                          x="-2"
                          y="-2"
                          width="36"
                          height="36"
                          filterUnits="userSpaceOnUse"
                          colorInterpolationFilters="sRGB"
                        >
                          <feFlood floodOpacity="0" result="BackgroundImageFix" />
                          <feColorMatrix
                            in="SourceAlpha"
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                            result="hardAlpha"
                          />
                          <feOffset />
                          <feGaussianBlur stdDeviation="1" />
                          <feComposite in2="hardAlpha" operator="out" />
                          <feColorMatrix
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0"
                          />
                          <feBlend
                            mode="normal"
                            in2="BackgroundImageFix"
                            result="effect1_dropShadow_1_313"
                          />
                          <feBlend
                            mode="normal"
                            in="SourceGraphic"
                            in2="effect1_dropShadow_1_313"
                            result="shape"
                          />
                        </filter>
                      </defs>
                      <g filter="url(#cursor-text-shadow)">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M20.315 7.505C20.315 8.249 19.759 8.889 19.023 8.994C18.431 9.079 17.984 9.596 17.984 10.196V20.426C17.984 21.027 18.43 21.544 19.021 21.629C19.756 21.733 20.312 22.374 20.312 23.118C20.309 23.561 20.118 23.974 19.787 24.257C19.458 24.54 19.021 24.668 18.59 24.604C17.807 24.492 17.078 24.161 16.481 23.659C15.883 24.161 15.154 24.492 14.367 24.605C13.94 24.668 13.504 24.541 13.173 24.257C12.842 23.97 12.653 23.558 12.65 23.125C12.65 22.374 13.206 21.733 13.942 21.628C14.536 21.543 14.984 21.026 14.984 20.426V10.196C14.984 9.596 14.537 9.079 13.944 8.994C13.209 8.889 12.654 8.249 12.654 7.505C12.655 7.065 12.846 6.651 13.177 6.366C13.447 6.133 13.796 6.002 14.158 6.002H14.239L14.39 6.021C15.164 6.132 15.889 6.462 16.484 6.964C17.083 6.462 17.812 6.13 18.598 6.018C19.013 5.951 19.455 6.077 19.792 6.366C20.123 6.653 20.312 7.065 20.315 7.498V7.502V7.505Z"
                          fill="#FFFFFF"
                        />
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M14.087 8.003C15.169 8.158 15.985 9.101 15.985 10.195V20.425C15.985 21.519 15.167 22.462 14.083 22.617C13.836 22.652 13.65 22.867 13.65 23.117C13.651 23.263 13.714 23.401 13.824 23.497C13.935 23.591 14.08 23.635 14.226 23.614C15.148 23.482 15.978 22.943 16.481 22.16C16.985 22.943 17.814 23.482 18.737 23.614C18.879 23.635 19.027 23.591 19.137 23.496C19.248 23.401 19.311 23.263 19.312 23.117C19.312 22.867 19.126 22.652 18.879 22.617C17.799 22.462 16.985 21.52 16.985 20.425V10.195C16.985 9.101 17.801 8.158 18.883 8.003C19.13 7.968 19.316 7.753 19.316 7.503C19.315 7.358 19.251 7.219 19.141 7.123C19.03 7.029 18.885 6.983 18.74 7.006C17.818 7.139 16.988 7.677 16.484 8.46C15.98 7.677 15.151 7.139 14.229 7.006C14.206 7.003 14.182 7.001 14.158 7.001C14.038 7.001 13.921 7.044 13.829 7.123C13.718 7.219 13.655 7.357 13.654 7.504C13.654 7.753 13.84 7.968 14.087 8.003Z"
                          fill="#000000"
                        />
                      </g>
                    </svg>
                  ) : showButtonCursor ? (
                    <svg
                      className="absolute z-10"
                      width="19"
                      height="23"
                      viewBox="0 0 19 23"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{
                        width: `${BUTTON_CURSOR_RENDER_WIDTH}px`,
                        height: `${BUTTON_CURSOR_RENDER_HEIGHT}px`,
                        top: `${BUTTON_CURSOR_RENDER_TOP}px`,
                        left: `${BUTTON_CURSOR_RENDER_LEFT}px`,
                        position: "absolute",
                      }}
                    >
                      <g filter="url(#cursor-button-shadow)">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M10.301 19.704C11.359 19.704 12.279 19.484 13.059 19.043C13.841 18.602 14.445 17.957 14.87 17.105C15.296 16.253 15.509 15.211 15.509 13.976V12.326C15.509 11.559 15.389 10.97 15.149 10.556C14.909 10.143 14.563 9.936 14.114 9.936V11.03C14.114 11.182 14.063 11.304 13.963 11.395C13.862 11.486 13.749 11.531 13.621 11.531C13.487 11.531 13.37 11.486 13.27 11.395C13.169 11.304 13.119 11.182 13.119 11.03V9.671C13.119 9.398 13.049 9.186 12.91 9.037C12.769 8.888 12.572 8.814 12.316 8.814C12.116 8.814 11.918 8.857 11.724 8.942V10.675C11.724 10.833 11.673 10.957 11.573 11.049C11.472 11.14 11.359 11.185 11.231 11.185C11.097 11.185 10.98 11.14 10.88 11.049C10.779 10.957 10.729 10.833 10.729 10.675V8.668C10.729 8.401 10.658 8.189 10.515 8.034C10.372 7.879 10.179 7.801 9.936 7.801C9.729 7.801 9.528 7.847 9.334 7.938V10.328C9.334 10.468 9.287 10.587 9.192 10.684C9.098 10.781 8.978 10.83 8.832 10.83C8.692 10.83 8.575 10.781 8.481 10.684C8.387 10.587 8.339 10.468 8.339 10.328V3.743C8.339 3.518 8.277 3.337 8.152 3.2C8.028 3.063 7.859 2.995 7.646 2.995C7.433 2.995 7.262 3.063 7.131 3.2C7 3.337 6.935 3.518 6.935 3.743V13.019C6.935 13.214 6.877 13.373 6.762 13.498C6.646 13.622 6.5 13.684 6.324 13.684C6.165 13.684 6.024 13.645 5.9 13.566C5.775 13.487 5.67 13.341 5.585 13.128L4.363 10.337C4.211 9.972 3.982 9.79 3.679 9.79C3.484 9.79 3.326 9.852 3.204 9.977C3.082 10.101 3.022 10.252 3.022 10.428C3.022 10.574 3.049 10.72 3.104 10.866L4.737 15.463C5.271 16.953 6.014 18.031 6.962 18.701C7.911 19.37 9.024 19.704 10.301 19.704ZM10.265 20.762C8.707 20.762 7.383 20.345 6.292 19.513C5.2 18.68 4.366 17.442 3.788 15.8L2.155 11.194C2.106 11.049 2.069 10.897 2.041 10.738C2.014 10.58 2 10.437 2 10.31C2 9.835 2.158 9.468 2.475 9.206C2.79 8.945 3.162 8.814 3.587 8.814C3.898 8.814 4.177 8.904 4.427 9.083C4.676 9.262 4.876 9.532 5.029 9.89L5.749 11.669C5.767 11.711 5.795 11.732 5.831 11.732C5.88 11.732 5.904 11.705 5.904 11.651V3.806C5.904 3.253 6.068 2.814 6.397 2.488C6.725 2.163 7.141 2 7.646 2C8.145 2 8.557 2.163 8.882 2.488C9.207 2.814 9.37 3.253 9.37 3.806V6.917C9.607 6.85 9.838 6.816 10.064 6.816C10.453 6.816 10.784 6.918 11.058 7.122C11.331 7.326 11.523 7.604 11.633 7.957C11.912 7.86 12.186 7.811 12.454 7.811C12.83 7.811 13.148 7.906 13.406 8.098C13.665 8.289 13.843 8.549 13.94 8.878C14.766 8.884 15.407 9.176 15.86 9.753C16.313 10.331 16.54 11.143 16.54 12.188V14.095C16.54 15.505 16.275 16.708 15.746 17.702C15.217 18.697 14.481 19.454 13.539 19.978C12.596 20.501 11.505 20.762 10.265 20.762Z"
                          fill="#000000"
                        />
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M10.301 19.704C11.359 19.704 12.279 19.484 13.059 19.043C13.841 18.602 14.445 17.957 14.87 17.105C15.296 16.253 15.509 15.211 15.509 13.976V12.326C15.509 11.559 15.389 10.97 15.149 10.556C14.909 10.143 14.563 9.936 14.114 9.936V11.03C14.114 11.182 14.063 11.304 13.963 11.395C13.862 11.486 13.749 11.531 13.621 11.531C13.487 11.531 13.37 11.486 13.27 11.395C13.169 11.304 13.119 11.182 13.119 11.03V9.671C13.119 9.398 13.049 9.186 12.91 9.03699C12.769 8.88799 12.572 8.814 12.316 8.814C12.116 8.814 11.918 8.857 11.724 8.942V10.675C11.724 10.833 11.673 10.957 11.573 11.049C11.472 11.14 11.359 11.185 11.231 11.185C11.097 11.185 10.98 11.14 10.88 11.049C10.779 10.957 10.729 10.833 10.729 10.675V8.668C10.729 8.401 10.658 8.18899 10.515 8.03399C10.372 7.87899 10.179 7.80099 9.936 7.80099C9.729 7.80099 9.528 7.847 9.334 7.938V10.328C9.334 10.468 9.287 10.587 9.192 10.684C9.098 10.781 8.978 10.83 8.832 10.83C8.692 10.83 8.575 10.781 8.481 10.684C8.387 10.587 8.339 10.468 8.339 10.328V3.743C8.339 3.518 8.277 3.337 8.152 3.2C8.028 3.063 7.859 2.995 7.646 2.995C7.433 2.995 7.262 3.063 7.131 3.2C7 3.337 6.935 3.518 6.935 3.743V13.019C6.935 13.214 6.877 13.373 6.762 13.498C6.646 13.622 6.5 13.684 6.324 13.684C6.165 13.684 6.024 13.645 5.9 13.566C5.775 13.487 5.67 13.341 5.585 13.128L4.363 10.337C4.211 9.972 3.982 9.79 3.679 9.79C3.484 9.79 3.326 9.852 3.204 9.977C3.082 10.101 3.022 10.252 3.022 10.428C3.022 10.574 3.049 10.72 3.104 10.866L4.737 15.463C5.271 16.953 6.014 18.031 6.962 18.701C7.911 19.37 9.024 19.704 10.301 19.704Z"
                          fill="#FFFFFF"
                        />
                      </g>
                      <defs>
                        <filter
                          id="cursor-button-shadow"
                          x="0"
                          y="0"
                          width="18.54"
                          height="22.762"
                          filterUnits="userSpaceOnUse"
                          colorInterpolationFilters="sRGB"
                        >
                          <feFlood floodOpacity="0" result="BackgroundImageFix" />
                          <feColorMatrix
                            in="SourceAlpha"
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                            result="hardAlpha"
                          />
                          <feOffset />
                          <feGaussianBlur stdDeviation="1" />
                          <feComposite in2="hardAlpha" operator="out" />
                          <feColorMatrix
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0"
                          />
                          <feBlend
                            mode="normal"
                            in2="BackgroundImageFix"
                            result="effect1_dropShadow_1_148"
                          />
                          <feBlend
                            mode="normal"
                            in="SourceGraphic"
                            in2="effect1_dropShadow_1_148"
                            result="shape"
                          />
                        </filter>
                      </defs>
                    </svg>
                  ) : (
                    <svg
                      className="absolute z-10"
                      width="32"
                      height="33"
                      viewBox="0 0 32 33"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      preserveAspectRatio="none"
                      style={{
                        width: "37px",
                        height: "41px",
                        top: 0,
                        left: 0,
                        position: "absolute",
                      }}
                    >
                      <defs>
                        <filter
                          id="cursor-pointer-shadow"
                          x="-2"
                          y="-2"
                          width="36"
                          height="36"
                          filterUnits="userSpaceOnUse"
                          colorInterpolationFilters="sRGB"
                        >
                          <feFlood floodOpacity="0" result="BackgroundImageFix" />
                          <feColorMatrix
                            in="SourceAlpha"
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                            result="hardAlpha"
                          />
                          <feOffset />
                          <feGaussianBlur stdDeviation="1" />
                          <feComposite in2="hardAlpha" operator="out" />
                          <feColorMatrix
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0"
                          />
                          <feBlend
                            mode="normal"
                            in2="BackgroundImageFix"
                            result="effect1_dropShadow_1_316"
                          />
                          <feBlend
                            mode="normal"
                            in="SourceGraphic"
                            in2="effect1_dropShadow_1_316"
                            result="shape"
                          />
                        </filter>
                      </defs>
                      <g filter="url(#cursor-pointer-shadow)">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M16.501 13.86L24.884 22.261C25.937 23.317 25.19 25.119 23.699 25.119L22.475 25.119L23.691 28.007C23.904 28.513 23.907 29.073 23.7 29.582C23.492 30.092 23.098 30.49 22.59 30.703C22.334 30.81 22.066 30.864 21.792 30.864C20.961 30.864 20.216 30.369 19.894 29.603L18.616 26.565L17.784 27.303C16.703 28.259 15 27.492 15 26.048V14.481C15 13.697 15.947 13.305 16.501 13.86Z"
                          fill="#FFFFFF"
                        />
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M15.999 15.129C15.999 14.998 16.159 14.932 16.25 15.025L24.159 22.95C24.59 23.382 24.284 24.119 23.674 24.119L20.97 24.118L22.769 28.394C22.996 28.934 22.742 29.555 22.203 29.781C21.662 30.008 21.042 29.755 20.816 29.216L18.998 24.892L17.139 26.539C16.723 26.907 16.081 26.651 16.007 26.127L15.999 26.026V15.129Z"
                          fill="#000000"
                        />
                      </g>
                    </svg>
                  )}
                </motion.div>
              ) : null}
            </div>
          </div>
          <div className="absolute left-[198px] top-[4.5rem] z-10 sm:left-auto sm:right-0 sm:top-1/2 sm:-translate-y-1/2">
            <motion.div
              drag={isMobileViewport ? false : true}
              dragConstraints={mainContainerRef}
              dragMomentum={false}
              dragElastic={0.1}
              initial={false}
              animate={{
                scale: terminalDragging ? 0.992 : 1,
                filter: terminalDragging
                  ? isDark
                    ? "drop-shadow(0px 6px 14px rgba(0, 0, 0, 0.3))"
                    : "drop-shadow(0px 6px 10px rgba(0, 0, 0, 0.045))"
                  : "drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))",
              }}
              transition={{
                duration: 0.16,
                ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
              }}
              onDragStart={() => {
                if (!terminalLabelDismissed) {
                  setTerminalLabelDismissed(true);
                }
                setTerminalDragging(true);
              }}
              onDragEnd={() => {
                setTerminalDragging(false);
              }}
              onClick={() => {
                playTerminalDrawKnife();
              }}
              onTap={() => {
                playTerminalDrawKnife();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  playTerminalDrawKnife();
                }
              }}
              role="button"
              tabIndex={0}
              whileDrag={{ cursor: "grabbing" }}
              style={{ x: terminalOffsetX, y: terminalOffsetY, willChange: "transform, filter" }}
              className="cursor-default active:cursor-grabbing sm:cursor-grab sm:touch-none"
            >
              <motion.div className="relative h-[200px] w-[225px] rounded-2xl [box-shadow:color(display-p3_1_1_1)_0px_0px_9px_inset,color(display-p3_0_0_0/5%)_0px_0px_0px_1px,color(display-p3_0_0_0/5%)_0px_0px_26px] dark:[box-shadow:color(display-p3_0.08_0.08_0.08)_0px_0px_9px_inset,color(display-p3_1_1_1/6%)_0px_0px_0px_1px,color(display-p3_0_0_0/20%)_0px_0px_26px] sm:h-54.75 sm:w-61.75">
                <motion.div
                  className="pointer-events-none absolute inset-0 rounded-2xl bg-[color(display-p3_1_1_1)] dark:bg-[color(display-p3_0.1_0.1_0.1)]"
                  initial={false}
                  animate={{ opacity: terminalDragging ? 0.94 : 1 }}
                  transition={{
                    duration: 0.16,
                    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                  }}
                  style={{ willChange: "opacity" }}
                  aria-hidden="true"
                />
                <div className="absolute top-3.5 left-3.5 flex items-start gap-[5.5px] p-0 size-fit">
                  <div className="rounded-full bg-[#DDDDDD] dark:bg-[#3A3A3A] shrink-0 size-2.5" />
                  <div className="rounded-full bg-[#DDDDDD] dark:bg-[#3A3A3A] shrink-0 size-2.5" />
                  <div className="rounded-full bg-[#DDDDDD] dark:bg-[#3A3A3A] shrink-0 size-2.5" />
                </div>
                <div className="absolute top-11 left-3.5 flex flex-col items-start">
                  <div
                    className={`${berkeleyMonoRegular.className} mb-3 flex items-start gap-1 [letter-spacing:0em] font-bold text-[13px]/4.5`}
                  >
                    <span className="w-3.75 shrink-0 tracking-[-0.01em] text-[color(display-p3_0.361_0.361_0.361)] dark:text-[color(display-p3_0.588_0.588_0.588)]">
                      $
                    </span>
                    <span className="tracking-[-0.01em] text-[color(display-p3_0.195_0.195_0.195)] dark:text-[color(display-p3_0.881_0.881_0.881)]">
                      expect
                    </span>
                  </div>
                  <div className="flex items-center gap-[4px]">
                    <TerminalStepCheck phase={formTerminalStepPhase} isDark={isDark} />
                    <TerminalStepLabel complete={terminalFormStepComplete}>
                      Fill form
                    </TerminalStepLabel>
                  </div>
                  <div className="mt-[6px] flex items-center gap-[4px]">
                    <TerminalStepCheck phase={submitTerminalStepPhase} isDark={isDark} />
                    <TerminalStepLabel complete={terminalSubmitStepComplete}>
                      Submit form
                    </TerminalStepLabel>
                  </div>
                  <div className="mt-[6px] flex items-center gap-[4px]">
                    <TerminalStepCheck
                      phase={redirectTerminalStepPhase}
                      successColor={TERMINAL_FAILURE_RED}
                      successIcon="close"
                      isDark={isDark}
                    />
                    <TerminalStepLabel
                      complete={terminalRedirectStepComplete}
                      showStrikeThrough={false}
                    >
                      Redirect page
                    </TerminalStepLabel>
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {!terminalLabelDismissed ? (
                    <motion.div
                      key="terminal-label"
                      className={`${restartHardRegular.className} absolute left-1/2 top-[calc(100%+6px)] [letter-spacing:0em] text-center text-[color(display-p3_0.469_0.469_0.469)] dark:text-[color(display-p3_0.55_0.55_0.55)] text-[11px]/4.5 size-fit`}
                      style={{
                        x: "-50%",
                        fontVariationSettings: '"CONN" 50, "wght" 400, "ital" 0',
                        transformOrigin: "center center",
                      }}
                      exit={{
                        opacity: 0,
                        scale: 0.84,
                        y: -7,
                      }}
                      transition={{
                        opacity: {
                          duration: 0.12,
                          ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                        },
                        scale: {
                          duration: 0.18,
                          ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                        },
                        y: {
                          duration: 0.18,
                          ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                        },
                      }}
                    >
                      Expect CLI
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
      <motion.div
        {...stagger(1)}
        className="mt-2 flex w-full max-w-82.75 justify-start sm:w-82.75 sm:max-w-none"
      >
        <div
          className={`${testSignifierRegular.className} h-fit w-full max-w-77 tracking-[-0.04em] text-black dark:text-[color(display-p3_0.922_0.922_0.922)] text-3xl/9.5 sm:w-77 sm:max-w-none`}
        >
          Let agents test your code in a real browser
        </div>
      </motion.div>
      <motion.div
        {...stagger(2)}
        className="flex w-full max-w-82.75 justify-start sm:w-82.75 sm:max-w-none"
      >
        <Description className="mt-[11px] gap-[20px]" action={<ViewDemoButton />}>
          One command scans your unstaged changes or branch diff, then generates a test plan, and
          runs it against a live browser.
        </Description>
      </motion.div>
      <motion.div
        {...stagger(3)}
        className="flex w-full max-w-82.75 justify-start sm:w-82.75 sm:max-w-none"
      >
        <div
          className={`${testSignifierRegular.className} mt-10 mb-[0.5px] h-fit w-full max-w-66.75 tracking-[-0.02em] text-black dark:text-[color(display-p3_0.92_0.92_0.92)] text-[18px]/6.25 sm:w-66.75 sm:max-w-none`}
        >
          Installation
        </div>
      </motion.div>
      <motion.div
        {...stagger(4)}
        className="flex w-full max-w-82.75 justify-start pt-2 pb-6 sm:w-82.75 sm:max-w-none"
      >
        <InstallCommands />
      </motion.div>
      <div className="grow" />
      <div className="mt-16 mb-8 w-full max-w-82.5 sm:max-w-none flex items-center justify-start sm:justify-center">
        <div className="hidden sm:flex items-center gap-6">
          <a
            href="https://github.com/millionco/expect"
            target="_blank"
            rel="noopener noreferrer"
            className={`${restartHardRegular.className} w-fit h-4.5 [letter-spacing:0em] text-[color(display-p3_0.033_0.033_0.033)] dark:text-[color(display-p3_0.881_0.881_0.881)] text-[13px]/4.5 hover:underline`}
            style={{ fontVariationSettings: '"CONN" 50, "wght" 400, "ital" 0' }}
          >
            GitHub
          </a>
          <ThemeToggle theme={mounted ? currentTheme : "light"} setTheme={setTheme} />
          <a
            href="https://x.com/aidenybai"
            target="_blank"
            rel="noopener noreferrer"
            className={`${restartHardRegular.className} w-fit h-4.5 [letter-spacing:0em] text-[color(display-p3_0.033_0.033_0.033)] dark:text-[color(display-p3_0.881_0.881_0.881)] text-[13px]/4.5 hover:underline`}
            style={{ fontVariationSettings: '"CONN" 50, "wght" 400, "ital" 0' }}
          >
            X
          </a>
        </div>
        <div className="flex sm:hidden items-center justify-between w-full">
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/millionco/expect"
              target="_blank"
              rel="noopener noreferrer"
              className="tracking-[-0.01em] text-[color(display-p3_0.033_0.033_0.033)] dark:text-[color(display-p3_0.881_0.881_0.881)] font-['ABC_Diatype',system-ui,sans-serif] text-[15px]/5 hover:underline"
            >
              GitHub
            </a>
            <a
              href="https://x.com/aidenybai"
              target="_blank"
              rel="noopener noreferrer"
              className="tracking-[-0.01em] text-[color(display-p3_0.033_0.033_0.033)] dark:text-[color(display-p3_0.881_0.881_0.881)] font-['ABC_Diatype',system-ui,sans-serif] text-[15px]/5 hover:underline"
            >
              X
            </a>
          </div>
          <ThemeToggle theme={mounted ? currentTheme : "light"} setTheme={setTheme} />
        </div>
      </div>
    </div>
  );
}

function ThemeToggle({
  theme,
  setTheme,
}: {
  theme: string | undefined;
  setTheme: (t: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const isAnimating = useRef(false);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [playSwitchOff] = useSound(switchOffSound, { volume: 0.1 });
  const [playSwitchOn] = useSound(switchOnSound, { volume: 0.1 });
  const { trigger: haptic } = useWebHaptics();
  const prevTheme = useRef(theme);

  const themeIndex = (t: string | undefined) => (t === "dark" ? 1 : 0);

  useEffect(() => {
    const container = containerRef.current;
    const el = indicatorRef.current;
    if (!container) return;

    const items = container.querySelectorAll<HTMLElement>("[data-slot='toggle-group-item']");
    const targetIdx = themeIndex(theme);
    const targetItem = items[targetIdx];
    if (!targetItem) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetItem.getBoundingClientRect();
    const targetLeft = targetRect.left - containerRect.left;
    const circleSize = targetRect.width;

    if (!hasInitialized.current || !el) {
      setIndicator({ left: targetLeft, width: circleSize, height: circleSize });
      hasInitialized.current = true;
      prevTheme.current = theme;
      return;
    }

    const prevIdx = themeIndex(prevTheme.current);
    const prevItem = items[prevIdx];
    if (!prevItem) return;
    const prevRect = prevItem.getBoundingClientRect();

    const fromLeft = Math.min(prevRect.left, targetRect.left) - containerRect.left;
    const toRight = Math.max(prevRect.right, targetRect.right) - containerRect.left;
    const spanWidth = toRight - fromLeft;

    const movingRight = targetIdx > prevIdx;
    isAnimating.current = true;

    const easeOut = "cubic-bezier(0.22, 1, 0.36, 1)";
    const easeInOut = "cubic-bezier(0.4, 0, 0.2, 1)";
    const spring = "cubic-bezier(0.34, 1.4, 0.64, 1)";

    el.style.transition = "none";
    el.style.left = `${prevRect.left - containerRect.left}px`;
    el.style.width = `${circleSize}px`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `left 0.22s ${easeOut}, width 0.22s ${easeOut}, transform 0.16s ${easeInOut}`;
        el.style.left = `${fromLeft}px`;
        el.style.width = `${spanWidth}px`;
        el.style.transform = "scaleY(0.85) scaleX(1.06)";
      });
    });

    const timeout = setTimeout(() => {
      el.style.transition = `left 0.2s ${easeOut}, width 0.2s ${easeOut}, transform 0.22s ${spring}`;
      el.style.left = `${targetLeft + (movingRight ? 1.5 : -1.5)}px`;
      el.style.width = `${circleSize}px`;
      el.style.transform = "scaleY(1.03) scaleX(0.98)";
    }, 160);

    const settleTimeout = setTimeout(() => {
      el.style.transition = `left 0.16s ${easeOut}, transform 0.2s ${spring}`;
      el.style.left = `${targetLeft}px`;
      el.style.transform = "scaleY(1) scaleX(1)";
    }, 320);

    const syncTimeout = setTimeout(() => {
      setIndicator({ left: targetLeft, width: circleSize, height: circleSize });
      isAnimating.current = false;
    }, 500);

    hasInitialized.current = true;
    prevTheme.current = theme;

    return () => {
      clearTimeout(timeout);
      clearTimeout(settleTimeout);
      clearTimeout(syncTimeout);
    };
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recalc = () => {
      if (isAnimating.current) return;
      const items = container.querySelectorAll<HTMLElement>("[data-slot='toggle-group-item']");
      const targetItem = items[themeIndex(theme)];
      if (!targetItem) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetItem.getBoundingClientRect();
      const el = indicatorRef.current;
      if (el) el.style.transition = "none";
      setIndicator({
        left: targetRect.left - containerRect.left,
        width: targetRect.width,
        height: targetRect.width,
      });
    };

    const observer = new ResizeObserver(recalc);
    observer.observe(container);
    return () => observer.disconnect();
  }, [theme]);

  return (
    <div ref={containerRef} className="size-fit">
      <ToggleGroup
        value={[theme === "dark" ? "dark" : "light"]}
        onValueChange={(value) => {
          const next = value[0];
          if (!next || next === theme) return;
          if (next === "dark") {
            playSwitchOff();
          } else if (theme === "dark") {
            playSwitchOn();
          }
          haptic("soft");
          setTheme(next);
        }}
        className="relative !gap-1 !rounded-full !bg-white !p-1 [box-shadow:color(display-p3_0_0_0/14%)_0px_0px_0px_0.5px] dark:!bg-transparent dark:[box-shadow:color(display-p3_1_1_1/14%)_0px_0px_0px_0.5px]"
      >
        {indicator && (
          <div
            ref={indicatorRef}
            className="absolute rounded-full [box-shadow:color(display-p3_0_0_0/14%)_0px_0px_0px_0.5px] dark:[box-shadow:color(display-p3_1_1_1/14%)_0px_0px_0px_0.5px] pointer-events-none"
            style={{
              left: indicator.left,
              width: indicator.width,
              height: indicator.height,
            }}
          />
        )}
        <ToggleGroupItem
          value="light"
          aria-label="Light mode"
          className={`relative z-10 !rounded-full !p-1.5 sm:!p-1 !h-auto !min-w-0 !bg-transparent !border-0 hover:!bg-transparent aria-pressed:!bg-transparent text-black dark:text-white transition-opacity duration-75 cursor-pointer ${theme !== "light" ? "opacity-40 hover:!opacity-80" : ""}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="128"
            height="128"
            viewBox="0 0 24 24"
            fill="none"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            className="size-4 sm:size-3.5"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M17 12C17 14.761 14.761 17 12 17C9.239 17 7 14.761 7 12C7 9.239 9.239 7 12 7C14.761 7 17 9.239 17 12Z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M12 2V3.5M12 20.5V22M19.071 19.071L18.01 18.011M5.989 5.989L4.929 4.929M22 12H20.5M3.5 12H2M19.071 4.929L18.011 5.989M5.99 18.011L4.929 19.071"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="dark"
          aria-label="Dark mode"
          className={`relative z-10 !rounded-full !p-1.5 sm:!p-1 !h-auto !min-w-0 !bg-transparent !border-0 hover:!bg-transparent aria-pressed:!bg-transparent text-black dark:text-white transition-opacity duration-75 cursor-pointer ${theme !== "dark" ? "opacity-40 hover:!opacity-80" : ""}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="128"
            height="128"
            viewBox="0 0 24 24"
            fill="none"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            className="size-4 sm:size-3.5"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M21.5 14.078C20.3 14.719 18.93 15.082 17.475 15.082C12.749 15.082 8.918 11.251 8.918 6.525C8.918 5.07 9.281 3.7 9.922 2.5C5.668 3.497 2.5 7.315 2.5 11.873C2.5 17.19 6.81 21.5 12.127 21.5C16.685 21.5 20.503 18.332 21.5 14.078Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

/**
 * from Paper
 * https://app.paper.design/file/01KKVJZGYDH7NE03PKQE86N5EK?node=9JZ-0
 * on Mar 20, 2026
 */
function InstallCommands() {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <CommandRow command="npx -y expect-cli@latest init" />
      <div className="[font-synthesis:none] antialiased w-full mt-4">
        <div className="w-fit h-5 tracking-[-0.01em] text-[color(display-p3_0.361_0.361_0.361)] dark:text-[color(display-p3_0.55_0.55_0.55)] font-['ABC_Diatype',system-ui,sans-serif] shrink-0 text-[15px]/5 sm:text-[13px]/4.5">
          Add skill
        </div>
      </div>
      <CommandRow
        command="npx skills add https://github.com/millionco/expect --skill expect"
        fade
      />
    </div>
  );
}

function CommandRow({ command, fade }: { command: string; fade?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [scrolledLeft, setScrolledLeft] = useState(false);
  const [playCopy] = useSound(clickSoftSound, { volume: 0.15 });
  const { trigger: haptic } = useWebHaptics();
  const commandRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      animate={{ scale: pressed ? 0.998 : 1 }}
      transition={{ duration: 0.05, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative [font-synthesis:none] flex justify-between items-center w-full rounded-[12px] pr-3.5 pl-4 pb-3 pt-3 sm:pr-3 sm:pl-3.5 sm:pb-2.75 sm:pt-2.75 bg-[color(display-p3_0.924_0.924_0.924)] dark:bg-[color(display-p3_0.135_0.135_0.135)] dark:[background-image:linear-gradient(180deg,color(display-p3_0.135_0.135_0.135)_0%,color(display-p3_0.108_0.108_0.108)_100%)] antialiased cursor-text overflow-hidden"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        if (!commandRef.current) return;
        const range = document.createRange();
        range.selectNodeContents(commandRef.current);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }}
    >
      <AnimatePresence>
        {copied && (
          <motion.div
            key="shimmer"
            className="absolute inset-0 pointer-events-none z-10 bg-[linear-gradient(to_left,transparent_0%,rgba(255,255,255,0.12)_40%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.12)_60%,transparent_100%)] dark:bg-[linear-gradient(to_left,transparent_0%,rgba(255,255,255,0.01)_40%,rgba(255,255,255,0.018)_50%,rgba(255,255,255,0.01)_60%,transparent_100%)]"
            initial={{ x: "100%" }}
            animate={{ x: "-100%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          />
        )}
      </AnimatePresence>
      <div className={`${berkeleyMonoRegular.className} flex items-start gap-1 p-0 min-w-0`}>
        <div className="w-3.75 tracking-[-0.01em] text-[color(display-p3_0.361_0.361_0.361)] dark:text-[color(display-p3_0.588_0.588_0.588)] shrink-0 text-[14.5px]/5 sm:text-[12.5px]/4.5">
          $
        </div>
        <div className="relative min-w-0 overflow-hidden">
          <div
            ref={commandRef}
            onScroll={(e) => setScrolledLeft(e.currentTarget.scrollLeft > 2)}
            className={`tracking-[-0.01em] text-[color(display-p3_0.195_0.195_0.195)] dark:text-[color(display-p3_0.881_0.881_0.881)] text-[14.5px]/5 sm:text-[12.5px]/4.5 whitespace-nowrap ${fade ? "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pr-6" : ""}`}
          >
            {command}
          </div>
          {fade && (
            <>
              {scrolledLeft && (
                <div className="absolute left-0 top-0 h-full w-6 pointer-events-none z-10 bg-[linear-gradient(to_right,color(display-p3_0.924_0.924_0.924)_0%,color(display-p3_0.924_0.924_0.924/0%)_100%)] dark:bg-[linear-gradient(to_right,color(display-p3_0.135_0.135_0.135)_0%,color(display-p3_0.135_0.135_0.135/0%)_100%)]" />
              )}
              <div className="absolute right-0 top-0 h-full w-12 pointer-events-none z-10 bg-[linear-gradient(to_left,color(display-p3_0.924_0.924_0.924)_0%,color(display-p3_0.924_0.924_0.924/0%)_100%)] dark:bg-[linear-gradient(to_left,color(display-p3_0.135_0.135_0.135)_0%,color(display-p3_0.135_0.135_0.135/0%)_100%)]" />
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(command);
          playCopy();
          haptic("soft");
          setCopied(true);
          setPressed(true);
          setTimeout(() => setPressed(false), 200);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="cursor-pointer hover:opacity-70 transition-opacity duration-75 -m-2 p-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.svg
              key="check"
              initial={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
              transition={{ duration: 0.08, ease: [0.25, 0.1, 0.25, 1] }}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              className="text-[#424242] dark:text-[color(display-p3_0.588_0.588_0.588)] size-[17px] sm:size-[15px] shrink-0"
              fill="none"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M19.6905 5.77665C20.09 6.15799 20.1047 6.79098 19.7234 7.19048L9.22336 18.1905C9.03745 18.3852 8.78086 18.4968 8.51163 18.4999C8.2424 18.5031 7.98328 18.3975 7.79289 18.2071L4.29289 14.7071C3.90237 14.3166 3.90237 13.6834 4.29289 13.2929C4.68342 12.9024 5.31658 12.9024 5.70711 13.2929L8.48336 16.0692L18.2766 5.80953C18.658 5.41003 19.291 5.39531 19.6905 5.77665Z"
                fill="currentColor"
              />
            </motion.svg>
          ) : (
            <motion.svg
              key="copy"
              initial={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
              transition={{ duration: 0.08, ease: [0.25, 0.1, 0.25, 1] }}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              className="text-[#424242] dark:text-[color(display-p3_0.588_0.588_0.588)] size-[17px] sm:size-[15px] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 15C9 12.172 9 10.757 9.879 9.879C10.757 9 12.172 9 15 9L16 9C18.828 9 20.243 9 21.121 9.879C22 10.757 22 12.172 22 15V16C22 18.828 22 20.243 21.121 21.121C20.243 22 18.828 22 16 22H15C12.172 22 10.757 22 9.879 21.121C9 20.243 9 18.828 9 16L9 15Z" />
              <path d="M17 9C16.997 6.043 16.953 4.511 16.092 3.462C15.926 3.26 15.74 3.074 15.538 2.908C14.431 2 12.787 2 9.5 2C6.213 2 4.569 2 3.462 2.908C3.26 3.074 3.074 3.26 2.908 3.462C2 4.569 2 6.213 2 9.5C2 12.787 2 14.431 2.908 15.538C3.074 15.74 3.26 15.926 3.462 16.092C4.511 16.953 6.043 16.997 9 17" />
            </motion.svg>
          )}
        </AnimatePresence>
      </button>
    </motion.div>
  );
}

function ViewDemoButton() {
  return (
    <Link
      href="/replay?demo=true"
      className="flex size-fit flex-col items-start gap-0 rounded-full bg-[color(display-p3_0.982_0.982_0.982)] px-3.5 py-1.5 antialiased [font-synthesis:none] [background-image:linear-gradient(180deg,color(display-p3_1_1_1/65%)_0%,color(display-p3_0.982_0.982_0.982)_82.16%,color(display-p3_1_1_1/0%)_100%)] [box-shadow:color(display-p3_1_1_1)_0px_0px_9px_inset,color(display-p3_0_0_0/16%)_0px_0px_0px_0.5px] dark:bg-[color(display-p3_0.135_0.135_0.135)] dark:[background-image:linear-gradient(180deg,color(display-p3_0.165_0.165_0.165)_0%,color(display-p3_0.12_0.12_0.12)_82.16%,color(display-p3_0.095_0.095_0.095)_100%)] dark:[box-shadow:color(display-p3_0.08_0.08_0.08)_0px_0px_9px_inset,color(display-p3_1_1_1/12%)_0px_0px_0px_0.5px]"
    >
      <div
        className={`${restartHardRegular.className} h-4.5 w-fit shrink-0 [letter-spacing:0em] text-[13px]/4.5 text-[color(display-p3_0.033_0.033_0.033)] dark:text-[color(display-p3_0.881_0.881_0.881)]`}
        style={{ fontVariationSettings: '"CONN" 50, "wght" 400, "ital" 0' }}
      >
        View demo
      </div>
    </Link>
  );
}

function Description({
  children,
  className,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-start", action ? "gap-[11px]" : undefined, className)}>
      <div
        className={`${restartHardRegular.className} w-76 h-14.5 [letter-spacing:0em] text-[color(display-p3_0.361_0.361_0.361)] dark:text-[color(display-p3_0.67_0.67_0.67)] whitespace-pre-wrap text-[13px]/5.25`}
        style={{ fontVariationSettings: '"CONN" 50, "wght" 400, "ital" 0' }}
      >
        {children}
      </div>
      {action}
    </div>
  );
}
