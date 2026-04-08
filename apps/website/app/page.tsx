/**
 * from Paper
 * https://app.paper.design/file/01KN3QGZ2REZDFZ3FZCNWXEANN?node=F18-0
 * on Apr 4, 2026
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Stepper } from "pasito";

import { useDialKit, DialRoot } from "dialkit";
import "dialkit/styles.css";
import { ClaudeSpinner } from "./claude-spinner";

interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

interface AnimationConfig {
  codingDuration: number;
  slideDelay: number;
  diffDuration: number;
  cursorAppearDelay: number;
  cursorMoveDelay: number;
  cursorClickDelay: number;
  focusDelay: number;
  cursorAlertDelay: number;
  fixingDelay: number;
  fixDiffDelay: number;
  reloadDelay: number;
  reloadDuration: number;
  resetDelay: number;
  loopDelay: number;
  terminalScrollDuration: number;
  cursorMoveDuration: number;
  cursorEntranceStiffness: number;
  cursorEntranceDamping: number;
  cursorEntranceMass: number;
  browserSpringStiffness: number;
  browserSpringDamping: number;
  browserSpringMass: number;
  terminalSpringStiffness: number;
  terminalSpringDamping: number;
  terminalSpringMass: number;
  clickDuration: number;
  labelDuration: number;
  colorTransitionDuration: number;
}

const DEFAULT_CONFIG: AnimationConfig = {
  codingDuration: 1150,
  slideDelay: 700,
  diffDuration: 2100,
  cursorAppearDelay: 0,
  cursorMoveDelay: 1250,
  cursorClickDelay: 550,
  focusDelay: 50,
  cursorAlertDelay: 800,
  fixingDelay: 1400,
  fixDiffDelay: 1800,
  reloadDelay: 600,
  reloadDuration: 800,
  resetDelay: 2000,
  loopDelay: 400,
  terminalScrollDuration: 600,
  cursorMoveDuration: 400,
  cursorEntranceStiffness: 500,
  cursorEntranceDamping: 20,
  cursorEntranceMass: 400,
  browserSpringStiffness: 250,
  browserSpringDamping: 22,
  browserSpringMass: 600,
  terminalSpringStiffness: 120,
  terminalSpringDamping: 20,
  terminalSpringMass: 800,
  clickDuration: 100,
  labelDuration: 150,
  colorTransitionDuration: 300,
};

type AnimationPhase = "coding" | "diff" | "expect";
type CursorLabelState = "expect" | "security" | "alert" | "fixed";

function useAnimationPhase(config: AnimationConfig, onComplete: () => void) {
  const [phase, setPhase] = useState<AnimationPhase>("coding");
  const [slid, setSlid] = useState(false);
  const [focused, setFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorOnBrowser, setCursorOnBrowser] = useState(false);
  const [clicking, setClicking] = useState(false);
  const [labelVisible, setLabelVisible] = useState(false);
  const [cursorLabel, setCursorLabel] = useState<CursorLabelState>("security");
  const [cursorOnTerminal, setCursorOnTerminal] = useState(false);
  const [clickingTerminal, setClickingTerminal] = useState(false);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixDiff, setFixDiff] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadDone, setReloadDone] = useState(false);
  const [looping, setLooping] = useState(false);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    const c = config;

    const expectTime = c.codingDuration + c.diffDuration;
    const cursorAppearTime = expectTime + c.cursorAppearDelay;
    const cursorMoveTime = cursorAppearTime + c.cursorMoveDelay;
    const clickTime = cursorMoveTime + c.cursorClickDelay;
    const focusTime = clickTime + c.focusDelay;
    const alertTime = focusTime + c.cursorAlertDelay;

    const diffTimer = setTimeout(() => setPhase("diff"), c.codingDuration);
    const slideTimer = setTimeout(() => setSlid(true), c.codingDuration + c.slideDelay);
    const expectTimer = setTimeout(() => setPhase("expect"), expectTime);
    const cursorTimer = setTimeout(() => setCursorVisible(true), cursorAppearTime);
    const cursorMoveTimer = setTimeout(() => setCursorOnBrowser(true), cursorMoveTime);
    const clickTimer = setTimeout(() => setClicking(true), clickTime);
    const clickEndTimer = setTimeout(() => setClicking(false), clickTime + 100);
    const labelShowTimer = setTimeout(() => setLabelVisible(true), clickTime);
    const focusTimer = setTimeout(() => setFocused(true), focusTime);
    const alertTimer = setTimeout(() => setCursorLabel("alert"), alertTime);
    const fixingTime = alertTime + c.fixingDelay;
    const fixingTimer = setTimeout(() => {
      setFixing(true);
      setTerminalFocused(true);
      setFocused(false);
    }, fixingTime);
    const fixDiffTime = fixingTime + c.fixDiffDelay;
    const fixDiffTimer = setTimeout(() => {
      setFixDiff(true);
      setCursorLabel("fixed");
    }, fixDiffTime);
    const reloadTime = fixDiffTime + c.reloadDelay;
    const reloadTimer = setTimeout(() => setReloading(true), reloadTime);
    const reloadDoneTime = reloadTime + c.reloadDuration;
    const reloadDoneTimer = setTimeout(() => setReloadDone(true), reloadDoneTime);
    const resetTime = reloadDoneTime + c.resetDelay;
    const resetTimer = setTimeout(() => {
      setCursorVisible(false);
      setLabelVisible(false);
      setLooping(true);
      setSlid(false);
      setFocused(false);
      setTerminalFocused(false);
    }, resetTime);
    const loopTime = resetTime + c.loopDelay;
    const loopTimer = setTimeout(() => onCompleteRef.current(), loopTime);
    return () => {
      clearTimeout(diffTimer);
      clearTimeout(slideTimer);
      clearTimeout(expectTimer);
      clearTimeout(cursorTimer);
      clearTimeout(cursorMoveTimer);
      clearTimeout(clickTimer);
      clearTimeout(clickEndTimer);
      clearTimeout(labelShowTimer);
      clearTimeout(focusTimer);
      clearTimeout(alertTimer);
      clearTimeout(fixingTimer);
      clearTimeout(fixDiffTimer);
      clearTimeout(reloadTimer);
      clearTimeout(reloadDoneTimer);
      clearTimeout(resetTimer);
      clearTimeout(loopTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    phase,
    slid,
    focused,
    cursorVisible,
    cursorOnBrowser,
    cursorOnTerminal,
    clicking,
    clickingTerminal,
    labelVisible,
    cursorLabel,
    terminalFocused,
    fixing,
    fixDiff,
    reloading,
    reloadDone,
    looping,
  };
}

function TerminalContent({
  phase,
  fixing,
  fixDiff,
  looping,
  config,
  cycle,
}: {
  phase: AnimationPhase;
  fixing: boolean;
  fixDiff: boolean;
  looping: boolean;
  config: AnimationConfig;
  cycle: number;
}) {
  const showDiff = phase === "diff" || phase === "expect";
  const showExpect = phase === "expect";

  const scrollY = looping
    ? -450
    : fixDiff
      ? -300
      : fixing
        ? -220
        : showExpect
          ? -180
          : showDiff
            ? -70
            : 0;

  return (
    <motion.div
      className="flex flex-col items-start w-49 text-xs/4 gap-1"
      initial={cycle > 0 ? { y: 120 } : false}
      animate={{ y: scrollY }}
      transition={{ duration: config.terminalScrollDuration / 1000, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="h-7 shrink-0" />
      <div className="flex items-start shrink-0 gap-2.5">
        <svg
          width="217"
          height="144"
          viewBox="0 0 217 144"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: "41px", height: "auto", flexShrink: "0" }}
        >
          <path
            d="M216.06 57.69H188.18V0H27.88V57.69H0V86.85H27.44V114.73H41.28V143.89H55.57V114.73H68.52V143.45H82.36V115.17H133.42V143.89H147.71V115.17H160.66V143.45H174.06V115.17H187.91V86.85H216.02V57.69H216.06Z"
            fill="#F76038"
          />
          <path d="M55.63 29.61H68.58V57.69H55.63V29.61Z" fill="#FFFFFF" />
          <path d="M147.76 29.83H160.71V57.69H147.76V29.83Z" fill="#FFFFFF" />
        </svg>
      </div>
      <div className="h-2.5 shrink-0" />
      <div>
          <div className="flex items-center w-49 h-7 shrink-0 rounded-xs px-2.5 bg-white [box-shadow:#69696920_0px_0px_0px_0.5px]">
          <div className="[letter-spacing:-0.125px] inline-block text-[#323232] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
            build signup form
          </div>
        </div>
        <div className="h-2.25 shrink-0" />
        {!showDiff && <ClaudeSpinner message="coalescing..." />}
        {showDiff && (
          <div className="flex items-center shrink-0 gap-1.25">
            <div className="inline-block [white-space-collapse:preserve] w-max text-[color(display-p3_0.249_0.701_0.193)] font-['BerkeleyMono-Regular','Berkeley_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
              ⏺
            </div>
            <div className="[letter-spacing:-0.125px] inline-block [white-space-collapse:preserve] w-max text-[#1F1F1F] font-['JetBrains_Mono',system-ui,sans-serif] font-semibold shrink-0 text-[12.5px]/4.5">
              update
            </div>
            <div className="[letter-spacing:-0.125px] [white-space-collapse:preserve] inline-block w-max text-[#1F1F1F] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
              (signup.tsx)
            </div>
          </div>
        )}
      </div>
      {showDiff && (
        <>
          <div className="h-0.5 shrink-0" />
          <div className="flex flex-col w-full rounded-[3px] pt-1.25 pb-1.5 bg-[#D7F2D3] px-2">
            <div className="flex items-center gap-1.75">
              <div className="[letter-spacing:-0.125px] [white-space-collapse:preserve] inline-block w-max text-[color(display-p3_0.040_0.361_0)] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
                12 +
              </div>
              <div className="w-32 h-3.25 rounded-xs bg-[#B1E4AC] shrink-0" />
            </div>
            <div className="flex items-center gap-1.75">
              <div className="[letter-spacing:-0.125px] [white-space-collapse:preserve] inline-block w-max text-[color(display-p3_0.040_0.361_0)] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
                13 +
              </div>
              <div className="w-18 h-3.25 rounded-xs bg-[#B1E4AC] shrink-0" />
            </div>
          </div>
          <div className="flex items-center w-full rounded-[3px] py-0.75 px-2 gap-1.75 bg-[color(display-p3_1_0.879_0.854)]">
            <div className="[letter-spacing:-0.125px] [white-space-collapse:preserve] inline-block w-max text-[color(display-p3_0.625_0_0)] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
              61 -
            </div>
            <div className="w-26 h-3.25 rounded-xs bg-[#F9BFB5] shrink-0" />
          </div>
        </>
      )}
      {showExpect && (
        <div className="flex pl-0.5 items-start gap-1.25 mt-4">
          <div className="inline-block text-[#0074F9] font-['BerkeleyMono-Regular','Berkeley_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
            ⏺
          </div>
          <div className="flex flex-col">
            <div className="text-[#1F1F1F] font-['JetBrains_Mono',system-ui,sans-serif] font-semibold shrink-0 text-[12.5px]/4.5">
              changes detected,
            </div>
            <div className="font-['JetBrains_Mono',system-ui,sans-serif] font-semibold shrink-0 text-[12.5px]/4.5">
              <span className="text-[#1F1F1F]">activating </span>
              <span className="text-[#1A6DE0]">Expect</span>
            </div>
          </div>
        </div>
      )}
      {fixing && (
        <div className="mt-4">
          <div className={`flex items-start shrink-0 gap-2.5 ${fixDiff ? "" : "mb-2.5"}`}>
            <svg
              width="217"
              height="144"
              viewBox="0 0 217 144"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: "41px", height: "auto", flexShrink: "0" }}
            >
              <path
                d="M216.06 57.69H188.18V0H27.88V57.69H0V86.85H27.44V114.73H41.28V143.89H55.57V114.73H68.52V143.45H82.36V115.17H133.42V143.89H147.71V115.17H160.66V143.45H174.06V115.17H187.91V86.85H216.02V57.69H216.06Z"
                fill="#F76038"
              />
              <path d="M55.63 29.61H68.58V57.69H55.63V29.61Z" fill="#FFFFFF" />
              <path d="M147.76 29.83H160.71V57.69H147.76V29.83Z" fill="#FFFFFF" />
            </svg>
          </div>
          {!fixDiff && <ClaudeSpinner message="fixing login issue..." />}
        </div>
      )}
      {fixDiff && (
        <>
          <div className="h-0.5 shrink-0" />
          <div className="flex items-center shrink-0 gap-1.25">
            <div className="inline-block [white-space-collapse:preserve] w-max text-[color(display-p3_0.249_0.701_0.193)] font-['BerkeleyMono-Regular','Berkeley_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
              ⏺
            </div>
            <div className="[letter-spacing:-0.125px] inline-block [white-space-collapse:preserve] w-max text-[#1F1F1F] font-['JetBrains_Mono',system-ui,sans-serif] font-semibold shrink-0 text-[12.5px]/4.5">
              update
            </div>
            <div className="[letter-spacing:-0.125px] [white-space-collapse:preserve] inline-block w-max text-[#1F1F1F] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
              (signup.tsx)
            </div>
          </div>
          <div className="flex flex-col w-full rounded-[3px] pt-1.25 pb-1.5 bg-[#D7F2D3] px-2">
            <div className="flex items-center gap-1.75">
              <div className="[letter-spacing:-0.125px] [white-space-collapse:preserve] inline-block w-max text-[color(display-p3_0.040_0.361_0)] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
                62 +
              </div>
              <div className="w-28 h-3.25 rounded-xs bg-[#B1E4AC] shrink-0" />
            </div>
            <div className="flex items-center gap-1.75">
              <div className="[letter-spacing:-0.125px] [white-space-collapse:preserve] inline-block w-max text-[color(display-p3_0.040_0.361_0)] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
                63 +
              </div>
              <div className="w-20 h-3.25 rounded-xs bg-[#B1E4AC] shrink-0" />
            </div>
            <div className="flex items-center gap-1.75">
              <div className="[letter-spacing:-0.125px] [white-space-collapse:preserve] inline-block w-max text-[color(display-p3_0.040_0.361_0)] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
                64 +
              </div>
              <div className="w-14 h-3.25 rounded-xs bg-[#B1E4AC] shrink-0" />
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

function BrowserPreview({
  slid,
  focused,
  fixing,
  fixDiff,
  reloading,
  reloadDone,
  config,
}: {
  slid: boolean;
  focused: boolean;
  fixing: boolean;
  fixDiff: boolean;
  reloading: boolean;
  reloadDone: boolean;
  config: AnimationConfig;
}) {
  const loading = slid;
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!slid) return;
    const timer = setTimeout(() => setLoaded(true), 600);
    return () => clearTimeout(timer);
  }, [slid]);

  return (
    <motion.div
      className="absolute top-0 left-0"
      suppressHydrationWarning
      initial={false}
      animate={
        focused
          ? { x: -90, y: -8, scale: 1.04, zIndex: 20 }
          : { x: -90, y: -8, scale: 1, zIndex: 0 }
      }
      transition={{
        type: "spring",
        stiffness: config.browserSpringStiffness,
        damping: config.browserSpringDamping,
        mass: config.browserSpringMass / 1000,
      }}
    >
      <div className={`relative flex flex-col w-68.5 h-46 rounded-2xl pt-2.5 pr-2.25 pb-6.75 pl-4.75 bg-white overflow-hidden ${focused ? "[box-shadow:#69696920_0px_0px_0px_0.5px,#C4C4C430_0px_2px_6px]" : "[box-shadow:#69696920_0px_0px_0px_0.5px]"}`}>
        <div className="flex items-center -ml-1">
          <div className="flex items-center gap-1.5">
            <div className="rounded-full bg-[#FF726A] shrink-0 size-2.5" />
            <div className="rounded-full bg-[#FEBC2E] shrink-0 size-2.5" />
            <div className="rounded-full bg-[#EAEAEA] shrink-0 size-2.5" />
          </div>
          <div className="w-3.5 shrink-0" />
          <div className="relative w-36.25 h-6.5 rounded-full shrink-0 bg-white [box-shadow:#69696920_0px_0px_0px_0.5px] overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[#888888] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium">
              localhost
            </div>
            {loading && !loaded && (
              <motion.div
                className="absolute bottom-0 left-0 h-[2.5px] bg-[#007AFF]"
                initial={{ width: "0%" }}
                animate={{ width: "85%" }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              />
            )}
            {loaded && !reloading && (
              <motion.div
                className="absolute bottom-0 left-0 h-[2.5px] bg-[#007AFF]"
                initial={{ width: "85%" }}
                animate={{ width: "100%", opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            )}
            {reloading && !reloadDone && (
              <motion.div
                className="absolute bottom-0 left-0 h-[2.5px] bg-[#007AFF]"
                initial={{ width: "0%" }}
                animate={{ width: "90%" }}
                transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
              />
            )}
            {reloadDone && (
              <motion.div
                className="absolute bottom-0 left-0 h-[2.5px] bg-[#007AFF]"
                initial={{ width: "90%" }}
                animate={{ width: "100%", opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              />
            )}
          </div>
          <div className="w-2 shrink-0" />
          <div className="w-10.5 h-6.5 rounded-full shrink-0 bg-white [box-shadow:#69696920_0px_0px_0px_0.5px]" />
        </div>
        <AnimatePresence>
          {loaded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: (reloading && !reloadDone) || ((focused || fixing) && !reloading) ? 0 : 1 }}
              transition={{ duration: reloading ? 0.15 : 0.4, ease: "easeOut" }}
            >
              <div className="tracking-[-0.03em] [white-space-collapse:preserve] mt-4.5 w-max text-[#474747] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-base/9">
                login
              </div>
              <div className="w-52.75 h-7 rounded-full bg-white [box-shadow:#69696920_0px_0px_0px_0.5px] shrink-0" />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          className="absolute inset-0 bg-black pointer-events-none rounded-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: (focused || fixing) && !reloading ? 0.015 : 0 }}
          transition={{ duration: reloading ? 0.15 : 0.3 }}
        />
        <motion.div
          className="absolute bottom-0 left-0 right-0 z-20"
          initial={{ y: "100%", opacity: 1 }}
          animate={{
            y: (focused || fixing) && !reloading ? "0%" : "100%",
            opacity: reloading ? 0 : 1,
          }}
          transition={{
            y: { type: "spring", stiffness: 400, damping: 30 },
            opacity: { duration: 0.15, ease: "easeOut" },
          }}
        >
          <NetworkPanel fixed={fixDiff} />
        </motion.div>
      </div>
    </motion.div>
  );
}

function NetworkPanel({ fixed }: { fixed: boolean }) {
  return (
    <div className="[font-synthesis:none] flex flex-col bg-white antialiased">
      <div className="flex items-center justify-between relative pt-2.75 pr-3 pb-3.5 pl-3.75 h-10.75">
        <div className="left-4.75 top-3.75 w-52.75 h-7 rounded-lg absolute bg-white filter-[grayscale(100%)]" />
        <div className="flex left-0 top-0 items-center gap-1 relative p-0">
          <svg
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: "0" }}
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M11.132 4.432C11.482 4.099 11.773 4 12 4C12.227 4 12.518 4.099 12.868 4.432C13.222 4.769 13.587 5.304 13.915 6.042C14.476 7.305 14.873 9.033 14.974 11H9.026C9.127 9.033 9.524 7.305 10.085 6.042C10.413 5.304 10.778 4.769 11.132 4.432ZM7.023 11C7.126 8.796 7.568 6.782 8.258 5.23C8.318 5.094 8.381 4.961 8.446 4.831C6.095 5.999 4.4 8.289 4.062 11H7.023ZM4.062 13H7.023C7.126 15.204 7.568 17.218 8.258 18.77C8.318 18.906 8.381 19.039 8.446 19.169C6.095 18.001 4.4 15.711 4.062 13ZM2 12C2 6.477 6.477 2 12 2C17.523 2 22 6.477 22 12C22 17.523 17.523 22 12 22C6.477 22 2 17.523 2 12ZM19.938 11C19.6 8.289 17.905 5.999 15.554 4.831C15.619 4.961 15.682 5.094 15.742 5.23C16.432 6.782 16.874 8.796 16.977 11H19.938ZM16.977 13H19.938C19.6 15.711 17.905 18.001 15.554 19.169C15.619 19.039 15.682 18.906 15.742 18.77C16.432 17.218 16.874 15.204 16.977 13ZM14.974 13C14.873 14.966 14.476 16.695 13.915 17.958C13.587 18.696 13.222 19.231 12.868 19.568C12.518 19.901 12.227 20 12 20C11.773 20 11.482 19.901 11.132 19.568C10.778 19.231 10.413 18.696 10.085 17.958C9.524 16.695 9.127 14.966 9.026 13H14.974Z"
              fill="#949494"
            />
          </svg>
          <div className="[letter-spacing:-0.125px] w-max text-[color(display-p3_0.332_0.332_0.332)] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium shrink-0 text-xs/4.5">
            Network
          </div>
        </div>
        <svg
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          viewBox="0 0 15.847 15.496"
          width="15.847"
          height="15.496"
          style={{
            left: "0px",
            top: "0px",
            width: "9px",
            height: "auto",
            position: "relative",
            flexShrink: "0",
          }}
        >
          <g>
            <path
              d="M0.253 15.243C0.594 15.575 1.161 15.575 1.493 15.243L7.743 8.993L13.993 15.243C14.325 15.575 14.901 15.585 15.233 15.243C15.565 14.901 15.565 14.345 15.233 14.012L8.983 7.753L15.233 1.503C15.565 1.171 15.575 0.604 15.233 0.272C14.891-0.07 14.325-0.07 13.993 0.272L7.743 6.522L1.493 0.272C1.161-0.07 0.585-0.079 0.253 0.272C-0.079 0.614-0.079 1.171 0.253 1.503L6.503 7.753L0.253 14.012C-0.079 14.345-0.089 14.911 0.253 15.243Z"
              fill="#939393D9"
            />
          </g>
        </svg>
      </div>
      <div className="flex flex-col relative pt-0.5 pr-2.25 pb-2.5 pl-3.75 gap-3.25 h-15.5">
        <div className="left-4.75 top-4 w-19.5 h-6.25 rounded-lg absolute bg-[#FBFBFB] filter-[grayscale(100%)]" />
        <motion.div
          className="left-0 top-4.5 w-68.5 h-4.5 absolute"
          style={{
            backgroundImage:
              "linear-gradient(in oklab 90deg, oklab(92.4% 0.044 0.024 / 0%) 2.47%, oklab(92.4% 0.044 0.024) 12.64%, oklab(92.4% 0.044 0.024 / 0%) 100%)",
          }}
          animate={{ opacity: fixed ? 0 : 1 }}
          transition={{ duration: 0.3 }}
        />
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-1">
            <div className="rounded-full bg-[#E7E7E7] shrink-0 size-2" />
            <div className="w-15.25 h-2 rounded-full bg-[#E7E7E7] shrink-0" />
          </div>
          <div className="w-4 h-2 rounded-full bg-[#E7E7E7] shrink-0" />
        </div>
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-1">
            <motion.div
              className="rounded-full shrink-0 size-2"
              animate={{ backgroundColor: fixed ? "#E7E7E7" : "#FF6C58" }}
              transition={{ duration: 0.3 }}
            />
            <motion.div
              className="w-27.5 h-2 rounded-full shrink-0"
              animate={{ backgroundColor: fixed ? "#E7E7E7" : "#FF9F8E" }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <motion.div
            className="w-7.25 h-2 rounded-full shrink-0"
            animate={{ backgroundColor: fixed ? "#E7E7E7" : "#FFB1A2" }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-1">
            <div className="rounded-full bg-[#F1F1F1] shrink-0 size-2" />
            <div className="w-7.75 h-2 rounded-full bg-[#F1F1F1] shrink-0" />
          </div>
          <div className="w-4 h-2 rounded-full bg-[#F1F1F1] shrink-0" />
        </div>
      </div>
    </div>
  );
}

function AnimatedCursor({
  visible,
  onBrowser,
  onTerminal,
  clicking,
  clickingTerminal,
  labelVisible,
  label,
  config,
}: {
  visible: boolean;
  onBrowser: boolean;
  onTerminal: boolean;
  clicking: boolean;
  clickingTerminal: boolean;
  labelVisible: boolean;
  label: CursorLabelState;
  config: AnimationConfig;
}) {
  const isAlert = label === "alert";
  return (
    <motion.div
      className="absolute z-30 pointer-events-none"
      style={{ transformOrigin: "top left" }}
      initial={{ x: 200, y: 115, opacity: 0, scale: 0 }}
      animate={
        visible && onTerminal
          ? { x: 210, y: 80, opacity: 1, scale: 1 }
          : visible && onBrowser
            ? { x: -60, y: 145, opacity: 1, scale: 1 }
            : visible
              ? { x: 200, y: 115, opacity: 1, scale: 1 }
              : { opacity: 0, scale: 0.8 }
      }
      transition={
        !visible
          ? { duration: 0.2, ease: "easeOut" }
          : { duration: config.cursorMoveDuration / 1000, ease: [0.22, 1, 0.36, 1] }
      }
    >
      <motion.svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "40px", height: "auto" }}
        animate={
          isAlert
            ? { scale: 1, x: [0, -3, 3, -2, 2, -1, 1, 0] }
            : { scale: clicking || clickingTerminal ? 0.85 : 1, x: 0 }
        }
        transition={
          isAlert
            ? {
                x: { duration: 0.4, ease: "easeOut" },
                scale: { duration: config.clickDuration / 1000, ease: "easeOut" },
              }
            : { duration: config.clickDuration / 1000, ease: "easeOut" }
        }
      >
        <g filter="url(#filter0_d_4_7)">
          <path
            d="M2.58591 2.58594C3.14041 2.03143 3.96783 1.85171 4.70212 2.12695L15.7021 6.25195C16.5219 6.55937 17.0468 7.36516 16.997 8.23926C16.9471 9.11309 16.3344 9.85306 15.4853 10.0654L11.1484 11.1484L10.0654 15.4854C9.85303 16.3345 9.11306 16.9471 8.23923 16.9971C7.36513 17.0469 6.55934 16.5219 6.25192 15.7021L2.12692 4.70215C1.85168 3.96786 2.0314 3.14045 2.58591 2.58594Z"
            fill="white"
            stroke="white"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
        <motion.path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M4.17558 3.53185C3.99199 3.463 3.7851 3.50782 3.64646 3.64646C3.50782 3.7851 3.463 3.99199 3.53185 4.17558L7.65685 15.1756C7.7337 15.3805 7.93492 15.5117 8.15345 15.4992C8.37197 15.4868 8.557 15.3336 8.61009 15.1213L9.91232 9.91232L15.1213 8.61009C15.3336 8.557 15.4868 8.37197 15.4992 8.15345C15.5117 7.93492 15.3805 7.7337 15.1756 7.65685L4.17558 3.53185Z"
          animate={{
            fill: label === "fixed" ? "#28A745" : isAlert ? "#F03E35" : "#3F3F3F",
            stroke: label === "fixed" ? "#28A745" : isAlert ? "#F03E35" : "#3F3F3F",
          }}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          transition={{ duration: config.colorTransitionDuration / 1000 }}
        />
        <defs>
          <filter
            id="filter0_d_4_7"
            x="-0.000274658"
            y="-0.000244141"
            width="19.0005"
            height="19.0006"
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
            <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0" />
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_7" />
            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_7" result="shape" />
          </filter>
          <linearGradient
            id="paint0_linear_4_7"
            x1="9.50001"
            y1="3.5"
            x2="9.50001"
            y2="15.5"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#0172F4" />
            <stop offset="1" stopColor="#0168DF" />
          </linearGradient>
        </defs>
      </motion.svg>
      <motion.div
        className="absolute left-4 top-4 rounded-full px-2.5 py-1.5 font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[13px]/4.5 whitespace-nowrap bg-white [box-shadow:0_0_0_0.5px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.06)] flex items-center gap-1.5 origin-top-left"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: labelVisible ? 1 : 0, scale: labelVisible ? 1 : 0.5 }}
        transition={{ duration: config.labelDuration / 1000 }}
      >
        {label === "security" && (
          <svg className="size-3.75 animate-spin" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="#0074F9" strokeOpacity="0.3" strokeWidth="2.5" />
            <path
              d="M14.5 8C14.5 4.41015 11.5899 1.5 8 1.5"
              stroke="#0074F9"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        )}
        {isAlert && (
          <svg className="size-3.75" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4L12 12M12 4L4 12"
              stroke="#F03E35"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        )}
        {label === "fixed" && (
          <svg className="size-3.75" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8.5L6.5 12L13 4"
              stroke="#28A745"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </motion.div>
    </motion.div>
  );
}

function TerminalIllustration() {
  const [cycle, setCycle] = useState(0);
  const nextCycle = () => setCycle((previous) => previous + 1);

  const dial = useDialKit(
    "Animation",
    {
      restart: { type: "action" as const, label: "Restart Animation" },
      timing: {
        _collapsed: true,
        codingDuration: [DEFAULT_CONFIG.codingDuration, 0, 5000, 50],
        slideDelay: [DEFAULT_CONFIG.slideDelay, 0, 5000, 50],
        diffDuration: [DEFAULT_CONFIG.diffDuration, 0, 5000, 50],
        cursorAppearDelay: [DEFAULT_CONFIG.cursorAppearDelay, 0, 5000, 50],
        cursorMoveDelay: [DEFAULT_CONFIG.cursorMoveDelay, 0, 5000, 50],
        cursorClickDelay: [DEFAULT_CONFIG.cursorClickDelay, 0, 5000, 50],
        focusDelay: [DEFAULT_CONFIG.focusDelay, 0, 5000, 50],
        cursorAlertDelay: [DEFAULT_CONFIG.cursorAlertDelay, 0, 5000, 50],
        fixingDelay: [DEFAULT_CONFIG.fixingDelay, 0, 5000, 50],
        fixDiffDelay: [DEFAULT_CONFIG.fixDiffDelay, 0, 5000, 50],
        reloadDelay: [DEFAULT_CONFIG.reloadDelay, 0, 5000, 50],
        reloadDuration: [DEFAULT_CONFIG.reloadDuration, 0, 5000, 50],
        resetDelay: [DEFAULT_CONFIG.resetDelay, 0, 5000, 50],
        loopDelay: [DEFAULT_CONFIG.loopDelay, 0, 5000, 50],
      },
      transitions: {
        _collapsed: true,
        terminalScrollDuration: [DEFAULT_CONFIG.terminalScrollDuration, 50, 2000, 10],
        cursorMoveDuration: [DEFAULT_CONFIG.cursorMoveDuration, 50, 2000, 10],
        clickDuration: [DEFAULT_CONFIG.clickDuration, 10, 500, 10],
        labelDuration: [DEFAULT_CONFIG.labelDuration, 10, 1000, 10],
        colorTransitionDuration: [DEFAULT_CONFIG.colorTransitionDuration, 10, 1000, 10],
      },
      browserSpring: {
        type: "spring" as const,
        stiffness: DEFAULT_CONFIG.browserSpringStiffness,
        damping: DEFAULT_CONFIG.browserSpringDamping,
        mass: DEFAULT_CONFIG.browserSpringMass / 1000,
      },
      terminalSpring: {
        type: "spring" as const,
        stiffness: DEFAULT_CONFIG.terminalSpringStiffness,
        damping: DEFAULT_CONFIG.terminalSpringDamping,
        mass: DEFAULT_CONFIG.terminalSpringMass / 1000,
      },
    },
    {
      onAction: (action) => {
        if (action === "restart") nextCycle();
      },
    },
  );

  const browserSpring = dial.browserSpring as unknown as SpringConfig;
  const terminalSpring = dial.terminalSpring as unknown as SpringConfig;

  const config: AnimationConfig = {
    ...DEFAULT_CONFIG,
    codingDuration: dial.timing.codingDuration,
    slideDelay: dial.timing.slideDelay,
    diffDuration: dial.timing.diffDuration,
    cursorAppearDelay: dial.timing.cursorAppearDelay,
    cursorMoveDelay: dial.timing.cursorMoveDelay,
    cursorClickDelay: dial.timing.cursorClickDelay,
    focusDelay: dial.timing.focusDelay,
    cursorAlertDelay: dial.timing.cursorAlertDelay,
    fixingDelay: dial.timing.fixingDelay,
    fixDiffDelay: dial.timing.fixDiffDelay,
    reloadDelay: dial.timing.reloadDelay,
    reloadDuration: dial.timing.reloadDuration,
    resetDelay: dial.timing.resetDelay,
    loopDelay: dial.timing.loopDelay,
    terminalScrollDuration: dial.transitions.terminalScrollDuration,
    cursorMoveDuration: dial.transitions.cursorMoveDuration,
    clickDuration: dial.transitions.clickDuration,
    labelDuration: dial.transitions.labelDuration,
    colorTransitionDuration: dial.transitions.colorTransitionDuration,
    browserSpringStiffness: browserSpring.stiffness ?? DEFAULT_CONFIG.browserSpringStiffness,
    browserSpringDamping: browserSpring.damping ?? DEFAULT_CONFIG.browserSpringDamping,
    browserSpringMass: (browserSpring.mass ?? DEFAULT_CONFIG.browserSpringMass / 1000) * 1000,
    terminalSpringStiffness: terminalSpring.stiffness ?? DEFAULT_CONFIG.terminalSpringStiffness,
    terminalSpringDamping: terminalSpring.damping ?? DEFAULT_CONFIG.terminalSpringDamping,
    terminalSpringMass: (terminalSpring.mass ?? DEFAULT_CONFIG.terminalSpringMass / 1000) * 1000,
    cursorEntranceStiffness: DEFAULT_CONFIG.cursorEntranceStiffness,
    cursorEntranceDamping: DEFAULT_CONFIG.cursorEntranceDamping,
    cursorEntranceMass: DEFAULT_CONFIG.cursorEntranceMass,
  };

  return <TerminalAnimationView key={cycle} config={config} cycle={cycle} onComplete={nextCycle} />;
}

function TerminalAnimationView({
  config,
  cycle,
  onComplete,
}: {
  config: AnimationConfig;
  cycle: number;
  onComplete: () => void;
}) {
  const animState = useAnimationPhase(config, onComplete);
  const {
    phase,
    slid,
    focused,
    cursorVisible,
    cursorOnBrowser,
    cursorOnTerminal,
    clicking,
    clickingTerminal,
    labelVisible,
    cursorLabel,
    terminalFocused,
    fixing,
    fixDiff,
    reloading,
    reloadDone,
    looping,
  } = animState;

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-xs/4 mt-11.5 p-3 pb-14">
      <div className="relative w-68.5 h-46 shrink-0 overflow-visible">
        <BrowserPreview
          slid={slid}
          focused={focused}
          fixing={fixing}
          fixDiff={fixDiff}
          reloading={reloading}
          reloadDone={reloadDone}
          config={config}
        />
        <AnimatedCursor
          visible={cursorVisible}
          onBrowser={cursorOnBrowser}
          onTerminal={cursorOnTerminal}
          clicking={clicking}
          clickingTerminal={clickingTerminal}
          labelVisible={labelVisible}
          label={cursorLabel}
          config={config}
        />
        <motion.div
          className={`flex flex-col items-start w-56 h-46 relative z-10 rounded-2xl pt-4.5 pr-3.75 pb-6.5 pl-3.75 overflow-clip bg-white ${terminalFocused ? "[box-shadow:#69696920_0px_0px_0px_0.5px,#C4C4C430_0px_2px_6px]" : "[box-shadow:#69696920_0px_0px_0px_0.5px]"}`}
          style={{ x: 80 }}
          animate={{ scale: terminalFocused ? 1.04 : 1, zIndex: terminalFocused ? 20 : 10 }}
          transition={{
            type: "spring",
            stiffness: config.terminalSpringStiffness,
            damping: config.terminalSpringDamping,
            mass: config.terminalSpringMass / 1000,
          }}
        >
          <TerminalContent
            cycle={cycle}
            phase={phase}
            fixing={fixing}
            fixDiff={fixDiff}
            looping={looping}
            config={config}
          />
        </motion.div>
      </div>
    </div>
  );
}

const formatStarCount = (count: number) => {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
};

export default function HomePage() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"cli" | "agent-prompt">("cli");
  const [openFaqs, setOpenFaqs] = useState<Set<number>>(new Set());
  const [starCount, setStarCount] = useState<string>("3k");
  const commandRef = useRef<HTMLDivElement>(null);
  const expectRunCommandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/millionco/expect")
      .then((response) => response.json())
      .then((data) => {
        if (data.stargazers_count) setStarCount(formatStarCount(data.stargazers_count));
      })
      .catch(() => {});
  }, []);

  const commandText = activeTab === "cli"
    ? "npx -y expect-cli@latest init"
    : "fetch https://www.expect.dev/ and run init script";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(commandText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSelectCommand = () => {
    if (!commandRef.current) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(commandRef.current);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleSelectExpectRunCommand = () => {
    if (!expectRunCommandRef.current) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(expectRunCommandRef.current);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  return (
    <div className="[font-synthesis:none] overflow-x-clip antialiased min-h-screen bg-[color(display-p3_0.981_0.981_0.981)] flex flex-col items-center">
      <DialRoot position="top-right" theme="dark" defaultOpen={false} />
      <div className="w-full pt-6 pb-4 flex flex-col items-center relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.5) 15%, rgba(255,255,255,0.5) 85%, transparent 100%)' }}
        />
        <div className="w-112.75 relative">
          <div className="scale-[1.15] origin-top-left">
            <TerminalIllustration />
          </div>
        </div>
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-[584px]"
          style={{ background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.06) 75%, transparent 100%)' }}
        />
      </div>
      <div className="relative w-full max-w-112.75 min-w-0 px-4 sm:px-0">
        <div className="flex flex-col gap-[5px] mt-13">
          <div
            className="w-112.75 tracking-[-0.03em] [white-space-collapse:preserve] font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold text-[23px]/9.5 text-[#3c3c3c]"
            style={{ marginBottom: "3px" }}
          >
            Expect
          </div>
          <div
            className="[letter-spacing:0em] w-102 [white-space-collapse:preserve] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[17px]/[25px] text-[#707070]"
          >
            A skill for testing your agent&apos;s code in a real browser.
          </div>
        </div>
        {/**
         * from Paper
         * https://app.paper.design/file/01KN3QGZ2REZDFZ3FZCNWXEANN?page=01KNK40PV23TWD3DPP1AV1WTS4&node=I51-0
         * on Apr 7, 2026
         */}
        <div className="flex flex-col gap-2.75 mt-6">
          <div
            onClick={handleSelectCommand}
            className="[font-synthesis:none] flex w-112.75 h-22.25 flex-col rounded-[14px] pt-2.5 pr-3.5 pb-3.5 pl-3.75 gap-5 [box-shadow:#0000000F_0px_0px_0px_1px,#0000000F_0px_1px_2px_-1px,#0000000A_0px_2px_4px] antialiased cursor-text"
            style={{
              backgroundImage:
                "linear-gradient(in oklab 180deg, oklab(100% 0 0) 45.83%, oklab(97.8% 0 0) 46.26%)",
            }}
          >
            <div className="flex items-start gap-3.5">
              <button
                type="button"
                className="flex flex-col gap-0.5 cursor-pointer text-left"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveTab("cli");
                }}
              >
                <div
                  className={`left-0 top-0 [white-space-collapse:preserve] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[15.5px]/5.75 transition-colors duration-200 ${activeTab === "cli" ? "text-[#414141]" : "text-[#A0A0A0]"}`}
                >
                  npx
                </div>
              </button>
              <button
                type="button"
                className="cursor-pointer text-left"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveTab("agent-prompt");
                }}
              >
                <div
                  className={`left-0 top-0 [white-space-collapse:preserve] w-max font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium shrink-0 text-[15.5px]/5.75 transition-colors duration-200 ${activeTab === "agent-prompt" ? "text-[#414141]" : "text-[#A0A0A0]"}`}
                >
                  agent prompt
                </div>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.75 min-w-0">
                {activeTab === "cli" && (
                  <div className="left-0 top-0 [white-space-collapse:preserve] w-max text-[#696969] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium shrink-0 text-[15.5px]/5.75">
                    $
                  </div>
                )}
                <div
                  ref={commandRef}
                  className="left-0 top-0 [white-space-collapse:preserve] w-max min-w-0 text-[#414141] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium shrink-0 text-[15.5px]/5.75"
                >
                  {commandText}
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleCopy();
                }}
                className="cursor-pointer shrink-0 content-center group"
                aria-label="Copy command"
              >
                {copied && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ height: "20px", verticalAlign: "middle", width: "20px", overflow: "clip" }}
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10.28 3.22a.75.75 0 0 1 0 1.06l-5 5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06L4.75 7.69l4.47-4.47a.75.75 0 0 1 1.06 0Z"
                      fill="#059669"
                    />
                  </svg>
                )}
                {!copied && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    color="#0A0A0A"
                    style={{
                      height: "20px",
                      verticalAlign: "middle",
                      width: "20px",
                      overflow: "clip",
                      left: "0px",
                      top: "0px",
                      flexShrink: "0",
                    }}
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M3.25 2.25C3.25 1.698 3.698 1.25 4.25 1.25H9.25C10.079 1.25 10.75 1.922 10.75 2.75V7.75C10.75 8.302 10.302 8.75 9.75 8.75C9.474 8.75 9.25 8.526 9.25 8.25C9.25 7.974 9.474 7.75 9.75 7.75V2.75C9.75 2.474 9.526 2.25 9.25 2.25H4.25C4.25 2.526 4.026 2.75 3.75 2.75C3.474 2.75 3.25 2.526 3.25 2.25ZM1.25 4.75C1.25 3.922 1.922 3.25 2.75 3.25H7.25C8.078 3.25 8.75 3.922 8.75 4.75V9.25C8.75 10.079 8.078 10.75 7.25 10.75H2.75C1.922 10.75 1.25 10.079 1.25 9.25V4.75ZM2.75 4.25C2.474 4.25 2.25 4.474 2.25 4.75V9.25C2.25 9.526 2.474 9.75 2.75 9.75H7.25C7.526 9.75 7.75 9.526 7.75 9.25V4.75C7.75 4.474 7.526 4.25 7.25 4.25H2.75Z"
                      fill="#696969"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="relative w-full max-w-112.75 min-w-0 px-4 sm:px-0">
        <div className="[font-synthesis:none] flex w-full min-w-0 h-fit flex-col gap-4.25 antialiased mt-14">
          <div className="mb-0 left-0 top-0 w-full min-w-0 [white-space-collapse:preserve] relative text-[#3F3F3F] font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold text-[17px]/5.75">
            Getting started
          </div>
          {/**
           * from Paper
           * https://app.paper.design/file/01KN3QGZ2REZDFZ3FZCNWXEANN?page=01KNK40PV23TWD3DPP1AV1WTS4&node=I2N-0
           * on Apr 7, 2026
           */}
          <div className="[font-synthesis:none] flex w-full min-w-0 flex-col items-stretch gap-2.5 antialiased p-0">
            <div className="flex w-full min-w-0 items-start gap-2.25">
              <div className="h-5.75 text-[color(display-p3_0.722_0.722_0.722)] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium shrink-0 text-[16px]/5.75">
                •
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1.5">
                <div className="text-[#5a5a5a] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[16px]/5.75">
                  Run
                </div>
                <div
                  className="inline-flex items-center rounded-[9px] bg-[#ffecb8] px-2.25 py-px"
                  onClick={handleSelectExpectRunCommand}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    handleSelectExpectRunCommand();
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Select /expect command text"
                >
                  <div
                    ref={expectRunCommandRef}
                    className="text-[#7a4a08] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[16px]/5.75"
                  >
                    /expect
                  </div>
                </div>
                <div className="text-[#5a5a5a] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[16px]/5.75">
                  inside Claude Code, Codex,
                </div>
                <a
                  href="https://github.com/millionco/expect/tree/first-minor?tab=readme-ov-file#supported-agents"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer text-[color(display-p3_0.1632_0.5398_0.9268)] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium underline decoration-[color(display-p3_0.669_0.821_1)] decoration-2 underline-offset-[5px] text-[16px]/5.75 transition-[text-decoration-color] duration-200 ease-out hover:decoration-[color(display-p3_0.48_0.66_0.92)]"
                >
                  and more
                </a>
              </div>
            </div>
            <div className="flex w-full min-w-0 items-start gap-2.25">
              <div className="h-5.75 text-[color(display-p3_0.722_0.722_0.722)] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium shrink-0 text-[16px]/5.75">
                •
              </div>
              <div className="min-w-0 flex-1 text-[#5a5a5a] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[16px]/5.75">
                Expect spawns subagents simulating real logged-in users to find issues and regressions
              </div>
            </div>
            <div className="flex w-full min-w-0 items-start gap-2.25">
              <div className="h-5.75 text-[color(display-p3_0.722_0.722_0.722)] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium shrink-0 text-[16px]/5.75">
                •
              </div>
              <div className="min-w-0 flex-1 text-[#5a5a5a] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[16px]/5.75">
                Your agent will fix any issues Expect finds, then re-run to verify
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="relative w-full max-w-112.75 min-w-0 px-4 sm:px-0 pb-20">
        <a
          href="https://github.com/millionco/expect"
          target="_blank"
          rel="noopener noreferrer"
          className="group [font-synthesis:none] items-center flex justify-between mt-[20px] w-fit rounded-full overflow-clip gap-2.5 pl-3.25 pr-1.75 py-1.5 bg-white [box-shadow:#0000000F_0px_0px_0px_1px,#0000000F_0px_1px_2px_-1px,#0000000A_0px_2px_4px] antialiased transition-shadow hover:[box-shadow:#00000014_0px_0px_0px_1px,#00000014_0px_1px_2px_-1px,#0000000F_0px_2px_4px]"
        >
          <div className="items-center flex gap-1.25">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: '0', verticalAlign: 'middle', width: '15px', height: '15px', overflow: 'clip' }}>
              <defs><clipPath id="_starclip"><rect width="12" height="12" fill="#fff"/></clipPath></defs>
              <g clipPath="url(#_starclip)">
                <path className="fill-[#C0C0C0] transition-colors group-hover:fill-[#FFC200]" fillRule="evenodd" clipRule="evenodd" d="M6.884 1.195C6.513 0.468 5.474 0.468 5.103 1.195L3.94 3.474L1.414 3.875C0.608 4.004 0.287 4.992 0.864 5.57L2.671 7.38L2.273 9.906C2.145 10.713 2.986 11.323 3.714 10.953L5.994 9.793L8.273 10.953C9.001 11.323 9.842 10.713 9.715 9.906L9.316 7.38L11.124 5.57C11.701 4.992 11.379 4.004 10.573 3.875L8.047 3.474L6.884 1.195Z" />
              </g>
            </svg>
            <div className="shrink-0 [letter-spacing:-0.14px] w-max text-[#323232] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[15px]/4.5">
              GitHub
            </div>
          </div>
          <div className="flex flex-col items-start gap-0 px-2 py-0.75 rounded-full bg-[color(display-p3_0.956_0.956_0.956)]">
            <div className="items-center flex gap-1.25">
              <div className="shrink-0 [letter-spacing:-0.14px] w-max text-[#323232] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-sm/4.5">
                {starCount}
              </div>
            </div>
          </div>
        </a>
        <div className="flex flex-col w-107.25 mt-14">
          <div className="[letter-spacing:0em] font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold text-[17px]/5.75 text-[color(display-p3_0.248_0.248_0.248)] mb-2.75">
            FAQ
          </div>
          <div className="h-[0.5px] self-stretch shrink-0 bg-[#DDDDDD] mb-2.75" />
          {[
            {
              question: "What is Expect?",
              answer: (
                <div className="flex flex-col mt-1.5">
                  <div className="[letter-spacing:0em] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[14px]/5.5 text-[#858585] mb-2.5">
                    A skill that reads your git changes, generates a test plan, and runs it in a
                    real browser with Playwright.
                  </div>
                  <div className="[letter-spacing:0em] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[14px]/5.5 text-[#858585] mb-2.5">
                    It hooks into your existing agent (Claude Code, Codex, Cursor) and runs entirely
                    on your machine.
                  </div>
                  <div className="[letter-spacing:0em] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[14px]/5.5 text-[#858585] mb-2.5">
                    It checks for:
                  </div>
                  <div className="flex items-center justify-between pt-2 pb-2">
                    <div className="flex items-center gap-1.5">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ width: "14px", height: "auto", flexShrink: "0" }}
                      >
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M1.25 3.25C1.25 2.145 2.145 1.25 3.25 1.25H8.75C9.855 1.25 10.75 2.145 10.75 3.25V8.75C10.75 9.855 9.855 10.75 8.75 10.75H3.25C2.145 10.75 1.25 9.855 1.25 8.75V3.25ZM7.13 3.925C7.017 3.793 6.845 3.73 6.674 3.756C6.504 3.782 6.358 3.894 6.29 4.053L5.107 6.815L4.13 5.675C4.035 5.564 3.896 5.5 3.75 5.5H2.75C2.474 5.5 2.25 5.724 2.25 6C2.25 6.276 2.474 6.5 2.75 6.5H3.52L4.87 8.075C4.983 8.207 5.155 8.27 5.326 8.244C5.496 8.218 5.642 8.106 5.71 7.947L6.893 5.185L7.87 6.325C7.965 6.436 8.104 6.5 8.25 6.5H9.25C9.526 6.5 9.75 6.276 9.75 6C9.75 5.724 9.526 5.5 9.25 5.5H8.48L7.13 3.925Z"
                          fill="#696969"
                        />
                      </svg>
                      <div className="font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold text-[13px]/5 text-[#353535]">
                        Performance
                      </div>
                    </div>
                    <div className="font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[13px]/5 text-[#858585]">
                      long animation frames, INP, LCP
                    </div>
                  </div>
                  <div className="h-px bg-[#EEEEEE]" />
                  <div className="flex items-center justify-between pt-2 pb-2">
                    <div className="flex items-center gap-1.5">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ width: "14px", height: "auto", flexShrink: "0" }}
                      >
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M1.5 6.283C1.5 6.324 1.501 6.364 1.502 6.404C1.501 6.423 1.5 6.441 1.5 6.46C1.5 7.902 2.243 9.241 3.465 10.005L3.608 10.095L3.615 10.099L4.205 10.468L5.205 11.093C5.691 11.397 6.309 11.397 6.795 11.093L8.385 10.099C9.701 9.277 10.5 7.835 10.5 6.283V5.5V2.576C10.5 2.537 10.498 2.499 10.493 2.461C10.482 2.369 10.457 2.281 10.42 2.2C10.236 1.79 9.76 1.553 9.296 1.708L9.189 1.743C8.387 2.007 7.504 1.797 6.907 1.2C6.406 0.699 5.594 0.699 5.093 1.2C4.494 1.799 3.607 2.009 2.803 1.741L2.704 1.708C2.112 1.51 1.5 1.951 1.5 2.576V6.283ZM6.5 9.196V10.098L7.855 9.251C8.817 8.65 9.424 7.623 9.493 6.5H6.5V9.196ZM5.5 5.5V2.305V2.172C4.656 2.83 3.532 3.033 2.5 2.694V5.5H5.5Z"
                          fill="#696969"
                        />
                      </svg>
                      <div className="font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold text-[13px]/5 text-[#353535]">
                        Security
                      </div>
                    </div>
                    <div className="font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[13px]/5 text-[#858585]">
                      npm deps, CSRF attacks, vulns
                    </div>
                  </div>
                  <div className="h-px bg-[#EEEEEE]" />
                  <div className="flex items-center justify-between pt-2 pb-2">
                    <div className="flex items-center gap-1.5">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ width: "14px", height: "auto", flexShrink: "0" }}
                      >
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M1 6C1 3.239 3.239 1 6 1C8.761 1 11 3.239 11 6C11 6.934 10.172 7.496 9.385 7.496H8.015C7.37 7.496 6.912 8.124 7.109 8.738L7.24 9.147C7.376 9.569 7.321 10.02 7.106 10.376C6.885 10.739 6.492 11 6 11C3.239 11 1 8.761 1 6ZM6.105 3.391C6.208 3.793 5.967 4.201 5.565 4.304C5.164 4.408 4.755 4.166 4.652 3.765C4.549 3.363 4.791 2.955 5.192 2.852C5.593 2.749 6.002 2.99 6.105 3.391ZM3.795 4.603C4.194 4.715 4.427 5.129 4.315 5.528C4.204 5.927 3.79 6.159 3.391 6.048C2.992 5.936 2.759 5.522 2.871 5.124C2.982 4.725 3.396 4.492 3.795 4.603ZM4.749 7.223C4.459 6.927 3.984 6.922 3.688 7.212C3.392 7.501 3.387 7.976 3.676 8.272C3.966 8.568 4.441 8.573 4.737 8.284C5.033 7.994 5.038 7.519 4.749 7.223ZM8.312 4.788C8.016 5.077 7.541 5.072 7.251 4.776C6.962 4.48 6.967 4.005 7.263 3.716C7.559 3.426 8.034 3.431 8.323 3.727C8.613 4.023 8.608 4.498 8.312 4.788Z"
                          fill="#696969"
                        />
                      </svg>
                      <div className="font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold text-[13px]/5 text-[#353535]">
                        Design tweaks
                      </div>
                    </div>
                    <div className="font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[13px]/5 text-[#858585]">
                      broken hover states, links, buttons
                    </div>
                  </div>
                  <div className="h-px bg-[#EEEEEE]" />
                  <div className="flex items-center justify-between pt-2 pb-2">
                    <div className="flex items-center gap-1.5">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ width: "14px", height: "auto", flexShrink: "0" }}
                      >
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M1 6C1 3.239 3.239 1 6 1C8.761 1 11 3.239 11 6C11 8.761 8.761 11 6 11C3.239 11 1 8.761 1 6ZM4.5 5.5C4.914 5.5 5.25 5.164 5.25 4.75C5.25 4.336 4.914 4 4.5 4C4.086 4 3.75 4.336 3.75 4.75C3.75 5.164 4.086 5.5 4.5 5.5ZM9.436 6.667C9.488 6.396 9.311 6.134 9.04 6.081C8.769 6.028 8.507 6.205 8.454 6.477C8.345 7.041 8.044 7.551 7.602 7.919C7.161 8.288 6.606 8.493 6.031 8.5C5.456 8.507 4.896 8.316 4.446 7.958C3.995 7.601 3.682 7.099 3.558 6.537C3.499 6.267 3.232 6.097 2.963 6.156C2.693 6.215 2.522 6.482 2.582 6.752C2.755 7.538 3.193 8.241 3.824 8.741C4.454 9.242 5.238 9.51 6.043 9.5C6.848 9.49 7.625 9.203 8.243 8.687C8.861 8.171 9.282 7.457 9.436 6.667ZM8.25 4.75C8.25 5.164 7.914 5.5 7.5 5.5C7.086 5.5 6.75 5.164 6.75 4.75C6.75 4.336 7.086 4 7.5 4C7.914 4 8.25 4.336 8.25 4.75Z"
                          fill="#696969"
                        />
                      </svg>
                      <div className="font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold text-[13px]/5 text-[#353535]">
                        App completeness
                      </div>
                    </div>
                    <div className="font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[13px]/5 text-[#858585]">
                      missing metadata, dead links
                    </div>
                  </div>
                </div>
              ),
            },
            {
              question: "Why not just use Puppeteer, Playwright, or Cypress?",
              answer:
                "Instead of writing scripts, maintaining selectors, and wiring up assertions, Expect reads your code changes and tests them in a real browser automatically. It's like giving your agent QA superpowers.",
            },
            {
              question: "How is this different from computer-use agents?",
              answer:
                "General-purpose browser tools rely on screenshots and mouse coordinates. Expect is purpose-built for testing: it uses Playwright for fast DOM automation, reads your code changes, generates a test plan, and runs it with your real cookies, then reports back what's broken so the agent can fix it.",
            },
            {
              question: "Does it work in CI?",
              answer:
                "Yes. Use --ci or the add github-action command to set up a workflow that tests every PR. In CI mode it runs headless, skips cookie extraction, auto-approves the plan, and enforces a 30-minute timeout.",
            },
            { question: "Does it support mobile testing?", answer: "Coming soon." },
            {
              question: "Is there a hosted or enterprise version?",
              answer: "Coming soon. Email aiden@million.dev if you have questions or ideas.",
            },
          ].map((faq, index) => (
            <div key={index} className="group/faq pb-2.75">
              <div
                className="flex justify-between items-start transition-colors group-hover/faq:text-[#1E1E1E] pt-2.75 cursor-pointer"
                onClick={() =>
                  setOpenFaqs((previous) => {
                    const next = new Set(previous);
                    if (next.has(index)) {
                      next.delete(index);
                    } else {
                      next.add(index);
                    }
                    return next;
                  })
                }
              >
                <div
                  className={`[letter-spacing:0em] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[15px]/5.75 transition-colors group-hover/faq:text-[#1E1E1E] ${openFaqs.has(index) ? "text-[#1E1E1E]" : "text-[#5A5A5A]"}`}
                >
                  {faq.question}
                </div>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ width: "20px", height: "auto", flexShrink: "0" }}
                  className={`group-hover/faq:text-[#1E1E1E] transition-all duration-200 ${openFaqs.has(index) ? "text-[#1E1E1E] rotate-45" : "text-[#5A5A5A]"}`}
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M6.5 3C6.5 2.724 6.276 2.5 6 2.5C5.724 2.5 5.5 2.724 5.5 3V5.5H3C2.724 5.5 2.5 5.724 2.5 6C2.5 6.276 2.724 6.5 3 6.5H5.5V9C5.5 9.276 5.724 9.5 6 9.5C6.276 9.5 6.5 9.276 6.5 9V6.5H9C9.276 6.5 9.5 6.276 9.5 6C9.5 5.724 9.276 5.5 9 5.5H6.5V3Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-200 ${openFaqs.has(index) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
              >
                <div className="overflow-hidden">
                  {typeof faq.answer === "string" && (
                    <div className="[letter-spacing:0em] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[14px]/5.5 text-[#858585] whitespace-pre-line mt-1.5">
                      {faq.answer}
                    </div>
                  )}
                  {typeof faq.answer !== "string" && faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
