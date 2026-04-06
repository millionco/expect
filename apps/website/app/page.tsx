/**
 * from Paper
 * https://app.paper.design/file/01KN3QGZ2REZDFZ3FZCNWXEANN?node=F18-0
 * on Apr 4, 2026
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Calligraph } from "calligraph";
import { ClaudeSpinner } from "./claude-spinner";

const CODING_DURATION_MS = 1200;
const SLIDE_DELAY_MS = 650;
const DIFF_DURATION_MS = 1400;
const CURSOR_APPEAR_DELAY_MS = 175;
const CURSOR_MOVE_DELAY_MS = 1100;
const CURSOR_CLICK_DELAY_MS = 550;
const FOCUS_DELAY_MS = 50;
const CURSOR_LABEL_CHANGE_MS = 750;
const CURSOR_ALERT_DELAY_MS = 2350;
const LABEL_DISMISS_DELAY_MS = 200;
const CURSOR_RETURN_DELAY_MS = 100;
const TERMINAL_CLICK_DELAY_MS = 750;
const TERMINAL_FOCUS_DELAY_MS = 50;
const RESPONSIVENESS_DELAY_MS = 2600;
const REFOCUS_MOVE_DELAY_MS = 800;
const REFOCUS_CLICK_DELAY_MS = 500;
const INSPECT_DELAY_MS = 400;

type AnimationPhase = "coding" | "diff" | "expect";
type CursorLabelState = "expect" | "security" | "alert";

function useAnimationPhase() {
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
  const [showResponsiveness, setShowResponsiveness] = useState(false);
  const [cursorResolved, setCursorResolved] = useState(false);
  const [cursorNudged, setCursorNudged] = useState(false);
  const [clickingRefocus, setClickingRefocus] = useState(false);
  const [browserRefocused, setBrowserRefocused] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [cursorAtEdge, setCursorAtEdge] = useState(false);

  useEffect(() => {
    const expectTime = CODING_DURATION_MS + DIFF_DURATION_MS;
    const cursorAppearTime = expectTime + CURSOR_APPEAR_DELAY_MS;
    const cursorMoveTime = cursorAppearTime + CURSOR_MOVE_DELAY_MS;
    const clickTime = cursorMoveTime + CURSOR_CLICK_DELAY_MS;
    const focusTime = clickTime + FOCUS_DELAY_MS;
    const alertTime = focusTime + CURSOR_ALERT_DELAY_MS;
    const labelDismissTime = alertTime + LABEL_DISMISS_DELAY_MS;
    const cursorReturnTime = labelDismissTime + CURSOR_RETURN_DELAY_MS;
    const terminalClickTime = cursorReturnTime + TERMINAL_CLICK_DELAY_MS;
    const terminalFocusTime = terminalClickTime + TERMINAL_FOCUS_DELAY_MS;

    const diffTimer = setTimeout(() => setPhase("diff"), CODING_DURATION_MS);
    const slideTimer = setTimeout(() => setSlid(true), CODING_DURATION_MS + SLIDE_DELAY_MS);
    const expectTimer = setTimeout(() => setPhase("expect"), expectTime);
    const cursorTimer = setTimeout(() => setCursorVisible(true), cursorAppearTime);
    const cursorMoveTimer = setTimeout(() => setCursorOnBrowser(true), cursorMoveTime);
    const clickTimer = setTimeout(() => setClicking(true), clickTime);
    const clickEndTimer = setTimeout(() => setClicking(false), clickTime + 100);
    const labelShowTimer = setTimeout(() => setLabelVisible(true), clickTime);
    const focusTimer = setTimeout(() => setFocused(true), focusTime);
    const alertTimer = setTimeout(() => setCursorLabel("alert"), alertTime);
    const terminalFocusTimer = setTimeout(() => { setTerminalFocused(true); setFocused(false); }, alertTime);
    const responsivenessTime = alertTime + RESPONSIVENESS_DELAY_MS;
    const responsivenessTimer = setTimeout(() => {
      setShowResponsiveness(true);
      setLabelVisible(false);
      setCursorResolved(true);
    }, responsivenessTime);
    const nudgeTime = responsivenessTime + REFOCUS_MOVE_DELAY_MS;
    const refocusClickTime = nudgeTime + REFOCUS_CLICK_DELAY_MS;
    const nudgeTimer = setTimeout(() => setCursorNudged(true), nudgeTime);
    const refocusClickTimer = setTimeout(() => setClickingRefocus(true), refocusClickTime);
    const refocusClickEndTimer = setTimeout(() => setClickingRefocus(false), refocusClickTime + 100);
    const refocusTimer = setTimeout(() => { setBrowserRefocused(true); setTerminalFocused(false); }, refocusClickTime + 50);
    const inspectTime = refocusClickTime + 50 + INSPECT_DELAY_MS;
    const inspectTimer = setTimeout(() => setInspecting(true), inspectTime);
    const cursorEdgeTimer = setTimeout(() => setCursorAtEdge(true), inspectTime + 200);
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
      clearTimeout(terminalFocusTimer);
      clearTimeout(responsivenessTimer);
      clearTimeout(nudgeTimer);
      clearTimeout(refocusClickTimer);
      clearTimeout(refocusClickEndTimer);
      clearTimeout(refocusTimer);
      clearTimeout(inspectTimer);
      clearTimeout(cursorEdgeTimer);
    };
  }, []);

  return { phase, slid, focused, cursorVisible, cursorOnBrowser, cursorOnTerminal, clicking, clickingTerminal, clickingRefocus, labelVisible, cursorLabel, terminalFocused, showResponsiveness, cursorResolved, cursorNudged, browserRefocused, inspecting, cursorAtEdge };
}

function TerminalLine({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.05, delay }}
    >
      {children}
    </motion.div>
  );
}

function TerminalContent({ phase, alert, showResponsiveness }: { phase: AnimationPhase; alert: boolean; showResponsiveness: boolean }) {
  const showDiff = phase === "diff" || phase === "expect";
  const showExpect = phase === "expect";

  return (
    <motion.div
      className="flex flex-col items-start w-61 text-xs/4 gap-1"
      animate={{ y: showResponsiveness ? -230 : alert ? -210 : showExpect ? -180 : showDiff ? -70 : 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="h-7 shrink-0" />
      <div className="flex items-start shrink-0 gap-2.5">
        <svg width="217" height="144" viewBox="0 0 217 144" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '41px', height: 'auto', flexShrink: '0' }}>
          <path d="M216.06 57.69H188.18V0H27.88V57.69H0V86.85H27.44V114.73H41.28V143.89H55.57V114.73H68.52V143.45H82.36V115.17H133.42V143.89H147.71V115.17H160.66V143.45H174.06V115.17H187.91V86.85H216.02V57.69H216.06Z" fill="#F76038" />
          <path d="M55.63 29.61H68.58V57.69H55.63V29.61Z" fill="#FFFFFF" />
          <path d="M147.76 29.83H160.71V57.69H147.76V29.83Z" fill="#FFFFFF" />
        </svg>
      </div>
      <div className="h-2.5 shrink-0" />
      <div>
        <div className="flex items-center w-61 h-7 shrink-0 rounded-xs px-2.5 bg-white [box-shadow:#FFFFFF_0px_0px_9px_inset,#69696952_0px_0px_0px_0.5px,#C4C4C438_0px_1px_3px]">
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
              <div className="w-42.5 h-3.25 rounded-xs bg-[#B1E4AC] shrink-0" />
            </div>
            <div className="flex items-center gap-1.75">
              <div className="[letter-spacing:-0.125px] [white-space-collapse:preserve] inline-block w-max text-[color(display-p3_0.040_0.361_0)] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
                13 +
              </div>
              <div className="w-23.75 h-3.25 rounded-xs bg-[#B1E4AC] shrink-0" />
            </div>
          </div>
          <div className="flex items-center w-full rounded-[3px] py-0.75 px-2 gap-1.75 bg-[color(display-p3_1_0.879_0.854)]">
            <div className="[letter-spacing:-0.125px] [white-space-collapse:preserve] inline-block w-max text-[color(display-p3_0.625_0_0)] font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
              61 -
            </div>
            <div className="w-34 h-3.25 rounded-xs bg-[#F9BFB5] shrink-0" />
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
              <span className="text-[#1F1F1F]">activating </span><span className="text-[#1A6DE0]">Expect</span>
            </div>
          </div>
        </div>
      )}
      {alert && (
        <div className="flex pl-0.5 items-center gap-1.25 mt-4">
          <div className="inline-block text-[#E5291F] font-['BerkeleyMono-Regular','Berkeley_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
            ✕
          </div>
          <div className="text-[#E5291F] font-['JetBrains_Mono',system-ui,sans-serif] font-semibold shrink-0 text-[12.5px]/4.5">
            Security
          </div>
        </div>
      )}
      {showResponsiveness && (
        <div className="flex pl-0.5 items-center gap-1.25 mt-1.5">
          <div className="inline-block text-[#1F1F1F] font-['BerkeleyMono-Regular','Berkeley_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
            →
          </div>
          <div className="text-[#1F1F1F] font-['JetBrains_Mono',system-ui,sans-serif] font-semibold shrink-0 text-[12.5px]/4.5">
            Responsiveness
          </div>
        </div>
      )}
    </motion.div>
  );
}

function InspectionOverlay({ visible }: { visible: boolean }) {
  const perimeterLength = (274 + 184) * 2;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 z-20 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 274 184" fill="none">
            <motion.rect
              x="0.5" y="0.5" width="273" height="183"
              stroke="#3486F9"
              strokeWidth="1"
              strokeDasharray="6 4"
              fill="none"
              initial={{ strokeDashoffset: perimeterLength }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 -top-6 flex items-center justify-center w-7.5 h-4.75"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.6 }}
          >
            <div className="left-0 top-0 w-7.5 h-4.75 rounded-sm absolute bg-[#3486F9]" />
            <div className="[letter-spacing:-0.125px] w-max left-2 top-0 h-4.5 [white-space-collapse:preserve] absolute text-white font-['GeistMono-Medium','Geist_Mono',system-ui,sans-serif] font-medium text-xs/4.5">
              xl
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BrowserPreview({ slid, focused, inspecting }: { slid: boolean; focused: boolean; inspecting: boolean }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!slid) return;
    const timer = setTimeout(() => setLoaded(true), 500);
    return () => clearTimeout(timer);
  }, [slid]);

  return (
    <motion.div
      className="absolute top-0 left-0"
      suppressHydrationWarning
      initial={false}
      animate={
        focused
          ? { x: -100, y: -8, scale: 1.04, zIndex: 20 }
          : slid
            ? { x: -100, y: -8, scale: 1, zIndex: 0 }
            : { x: -12, y: -8, scale: 1, zIndex: 0 }
      }
      transition={{ type: "spring", stiffness: 250, damping: 22, mass: 0.6 }}
    >
      <motion.div
        className="relative flex flex-col w-68.5 h-46 pt-2.5 pr-2.25 pb-6.75 pl-4.75"
        animate={{
          backgroundColor: inspecting ? "#F9FCFF" : "#FFFFFF",
          borderRadius: inspecting ? "0px" : "16px",
          boxShadow: inspecting
            ? "#FFFFFF 0px 0px 9px inset, color(display-p3 0.784 0.859 1) 0px 0px 0px 0.5px"
            : "#FFFFFF 0px 0px 9px inset, #69696938 0px 0px 0px 0.5px, #C4C4C438 0px 1px 3px",
        }}
        transition={{ duration: 0.4 }}
      >
        <InspectionOverlay visible={inspecting} />
        <div className="flex items-center -ml-1">
          <div className="flex items-center gap-1.5">
            <motion.div className="rounded-full shrink-0 size-2.5" animate={{ backgroundColor: inspecting ? "color(display-p3 0.949 0.967 1)" : "#FF726A", borderWidth: inspecting ? "0.5px" : "0px", borderStyle: "solid", borderColor: inspecting ? "color(display-p3 0.395 0.593 1)" : "transparent" }} transition={{ duration: 0.4 }} />
            <motion.div className="rounded-full shrink-0 size-2.5" animate={{ backgroundColor: inspecting ? "color(display-p3 0.949 0.967 1)" : "#FEBC2E", borderWidth: inspecting ? "0.5px" : "0px", borderStyle: "solid", borderColor: inspecting ? "color(display-p3 0.395 0.593 1)" : "transparent" }} transition={{ duration: 0.4 }} />
            <motion.div className="rounded-full shrink-0 size-2.5" animate={{ backgroundColor: inspecting ? "color(display-p3 0.949 0.967 1)" : "#EAEAEA", borderWidth: inspecting ? "0.5px" : "0px", borderStyle: "solid", borderColor: inspecting ? "color(display-p3 0.395 0.593 1)" : "transparent" }} transition={{ duration: 0.4 }} />
          </div>
          <div className="w-3.5 shrink-0" />
          <div className="relative w-36.25 h-6.5 rounded-full shrink-0 bg-white [box-shadow:#FFFFFF_0px_0px_9px_inset,#A4A4A452_0px_0px_0px_0.5px,#C4C4C438_0px_1px_3px] overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[#888888] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium">localhost</div>
            {slid && !loaded && (
              <motion.div
                className="absolute bottom-0 left-0 h-[2.5px] bg-[#007AFF]"
                initial={{ width: "0%" }}
                animate={{ width: "85%" }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              />
            )}
            {slid && loaded && (
              <motion.div
                className="absolute bottom-0 left-0 h-[2.5px] bg-[#007AFF]"
                initial={{ width: "85%" }}
                animate={{ width: "100%", opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            )}
          </div>
          <div className="w-2 shrink-0" />
          <div className="w-10.5 h-6.5 rounded-full shrink-0 bg-white [box-shadow:#FFFFFF_0px_0px_9px_inset,#A4A4A452_0px_0px_0px_0.5px,#C4C4C438_0px_1px_3px]" />
        </div>
        <AnimatePresence>
          {loaded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <motion.div
                className="tracking-[-0.03em] [white-space-collapse:preserve] mt-4.5 w-max font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-base/9"
                animate={{ color: inspecting ? "#1C72F3" : "#474747" }}
                transition={{ duration: 0.4 }}
              >
                sign up
              </motion.div>
              <motion.div
                className="w-52.75 h-7 rounded-full shrink-0"
                animate={{
                  backgroundColor: inspecting ? "color(display-p3 0.949 0.967 1)" : "#FFFFFF",
                  boxShadow: inspecting
                    ? "color(display-p3 0.395 0.593 1) 0px 0px 0px 0.5px"
                    : "#FFFFFF 0px 0px 9px inset, #69696952 0px 0px 0px 0.5px, #C4C4C438 0px 1px 3px",
                }}
                transition={{ duration: 0.4 }}
              />

            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}


function AnimatedCursor({ visible, onBrowser, onTerminal, clicking, clickingTerminal, clickingRefocus, labelVisible, label, resolved, nudged, cursorAtEdge }: { visible: boolean; onBrowser: boolean; onTerminal: boolean; clicking: boolean; clickingTerminal: boolean; clickingRefocus: boolean; labelVisible: boolean; label: CursorLabelState; resolved: boolean; nudged: boolean; cursorAtEdge: boolean }) {
  const isAlert = label === "alert" && !resolved;
  return (
    <motion.div
      className="absolute z-30 pointer-events-none"
      style={{ transformOrigin: "top left" }}
      initial={{ x: 200, y: 115, opacity: 0, scale: 0 }}
      animate={
        visible && cursorAtEdge
          ? { x: 175, y: 100, opacity: 1, scale: 1 }
          : visible && nudged
            ? { x: -20, y: 105, opacity: 1, scale: 1 }
            : visible && onTerminal
            ? { x: 210, y: 80, opacity: 1, scale: 1 }
            : visible && onBrowser
              ? { x: -60, y: 145, opacity: 1, scale: 1 }
              : visible
                ? { x: 200, y: 115, opacity: 1, scale: 1 }
                : { x: 200, y: 115, opacity: 0, scale: 0 }
      }
      transition={
        !visible
          ? { type: "spring", stiffness: 500, damping: 20, mass: 0.4 }
          : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
      }
    >
      <motion.svg
        width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '40px', height: 'auto' }}
        animate={{ scale: (clicking || clickingTerminal || clickingRefocus) ? 0.85 : 1 }}
        transition={{ duration: 0.1, ease: "easeOut" }}
      >
        <g filter="url(#filter0_d_4_7)">
          <path d="M2.58591 2.58594C3.14041 2.03143 3.96783 1.85171 4.70212 2.12695L15.7021 6.25195C16.5219 6.55937 17.0468 7.36516 16.997 8.23926C16.9471 9.11309 16.3344 9.85306 15.4853 10.0654L11.1484 11.1484L10.0654 15.4854C9.85303 16.3345 9.11306 16.9471 8.23923 16.9971C7.36513 17.0469 6.55934 16.5219 6.25192 15.7021L2.12692 4.70215C1.85168 3.96786 2.0314 3.14045 2.58591 2.58594Z" fill="white" stroke="white" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
        </g>
        <motion.path fillRule="evenodd" clipRule="evenodd" d="M4.17558 3.53185C3.99199 3.463 3.7851 3.50782 3.64646 3.64646C3.50782 3.7851 3.463 3.99199 3.53185 4.17558L7.65685 15.1756C7.7337 15.3805 7.93492 15.5117 8.15345 15.4992C8.37197 15.4868 8.557 15.3336 8.61009 15.1213L9.91232 9.91232L15.1213 8.61009C15.3336 8.557 15.4868 8.37197 15.4992 8.15345C15.5117 7.93492 15.3805 7.7337 15.1756 7.65685L4.17558 3.53185Z" animate={{ fill: isAlert ? "#E5291F" : "#0074F9", stroke: isAlert ? "#E5291F" : "#0074F9" }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" transition={{ duration: 0.3 }}/>
        <defs>
          <filter id="filter0_d_4_7" x="-0.000274658" y="-0.000244141" width="19.0005" height="19.0006" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset/><feGaussianBlur stdDeviation="1"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_7"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_7" result="shape"/></filter>
          <linearGradient id="paint0_linear_4_7" x1="9.50001" y1="3.5" x2="9.50001" y2="15.5" gradientUnits="userSpaceOnUse"><stop stopColor="#0172F4"/><stop offset="1" stopColor="#0168DF"/></linearGradient>
        </defs>
      </motion.svg>
      <motion.div
        className="absolute left-4 top-4 rounded-full px-2.5 py-1 text-white font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[13px]/4.5 whitespace-nowrap [box-shadow:0_0_0_2px_white,0_1px_3px_rgba(0,0,0,0.2)] flex items-center gap-1.5 origin-top-left"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ backgroundColor: isAlert ? "#E5291F" : "#0074F9", opacity: labelVisible ? 1 : 0, scale: labelVisible ? 1 : 0.5 }}
        transition={{ duration: 0.15 }}
      >
        {label === "security" && (
          <svg className="size-3 animate-spin" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="white" strokeOpacity="0.3" strokeWidth="2.5" />
            <path d="M14.5 8C14.5 4.41015 11.5899 1.5 8 1.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
        {isAlert && (
          <svg className="size-3" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
        <Calligraph animation="smooth">Security</Calligraph>
      </motion.div>
    </motion.div>
  );
}

function TerminalIllustration() {
  const { phase, slid, focused, cursorVisible, cursorOnBrowser, cursorOnTerminal, clicking, clickingTerminal, clickingRefocus, labelVisible, cursorLabel, terminalFocused, showResponsiveness, cursorResolved, cursorNudged, browserRefocused, inspecting, cursorAtEdge } = useAnimationPhase();

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-xs/4 mt-11.5 p-3">
      <div className="relative w-68.5 h-46 shrink-0 overflow-visible">
        <BrowserPreview slid={slid} focused={focused || browserRefocused} inspecting={inspecting} />
        <AnimatedCursor visible={cursorVisible} onBrowser={cursorOnBrowser} onTerminal={cursorOnTerminal} clicking={clicking} clickingTerminal={clickingTerminal} clickingRefocus={clickingRefocus} labelVisible={labelVisible} label={cursorLabel} resolved={cursorResolved} nudged={cursorNudged} cursorAtEdge={cursorAtEdge} />
        <motion.div
          className="flex flex-col items-start w-68.5 h-46 relative z-10 rounded-2xl pt-4.5 pr-3.75 pb-6.5 pl-3.75 overflow-clip bg-white [box-shadow:#FFFFFF_0px_0px_9px_inset,#69696938_0px_0px_0px_0.5px,#C4C4C438_0px_1px_3px]"
          animate={slid ? { x: 80, scale: terminalFocused ? 1.04 : 1, zIndex: terminalFocused ? 20 : 10 } : { x: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 20, mass: 0.8 }}
        >
          <div suppressHydrationWarning className="absolute top-0 left-0 right-0 h-20 z-10 pointer-events-none select-none rounded-t-2xl" style={{ background: 'linear-gradient(to top, transparent 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.45) 75%, rgba(255,255,255,0.8) 100%)' }} />
          <div suppressHydrationWarning className="absolute bottom-0 left-0 right-0 h-12 z-10 pointer-events-none select-none rounded-b-2xl" style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.45) 75%, rgba(255,255,255,0.8) 100%)' }} />
          <TerminalContent phase={phase} alert={cursorLabel === "alert"} showResponsiveness={showResponsiveness} />
        </motion.div>
      </div>
    </div>
  );
}

export default function () {
  const [copied, setCopied] = useState(false);
  const [openFaqs, setOpenFaqs] = useState<Set<number>>(new Set());
  const commandRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText("npx -y expect-cli@latest init");
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
  return (
    <div className="[font-synthesis:none] overflow-x-clip antialiased min-h-screen bg-white flex flex-col items-center">
      <div className="w-full bg-[#FAFAFA] pb-6">
        <div className="w-112.75 mx-auto pt-2">
          <TerminalIllustration />
        </div>
      </div>
      <div className="relative w-112.75 pb-20">
        <div className="flex flex-col gap-2.5 mt-10">
          <div className="w-112.75 tracking-[-0.03em] [white-space-collapse:preserve] font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold text-[22px]/9.5 text-[color(display-p3_0.248_0.248_0.248)]">
            Expect more from your agents
          </div>
          <div className="[letter-spacing:0em] w-102 [white-space-collapse:preserve] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[15px]/5.75 text-[#707070]">
            Expect is an agent skill that tests your app in a browser so you don't have to. It checks for:
          </div>
        </div>
        <div className="flex items-center justify-between pt-2.5 pb-2.75 w-107.25 mt-6">
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: 'auto', flexShrink: '0' }}>
              <path fillRule="evenodd" clipRule="evenodd" d="M1.25 3.25C1.25 2.145 2.145 1.25 3.25 1.25H8.75C9.855 1.25 10.75 2.145 10.75 3.25V8.75C10.75 9.855 9.855 10.75 8.75 10.75H3.25C2.145 10.75 1.25 9.855 1.25 8.75V3.25ZM7.13 3.925C7.017 3.793 6.845 3.73 6.674 3.756C6.504 3.782 6.358 3.894 6.29 4.053L5.107 6.815L4.13 5.675C4.035 5.564 3.896 5.5 3.75 5.5H2.75C2.474 5.5 2.25 5.724 2.25 6C2.25 6.276 2.474 6.5 2.75 6.5H3.52L4.87 8.075C4.983 8.207 5.155 8.27 5.326 8.244C5.496 8.218 5.642 8.106 5.71 7.947L6.893 5.185L7.87 6.325C7.965 6.436 8.104 6.5 8.25 6.5H9.25C9.526 6.5 9.75 6.276 9.75 6C9.75 5.724 9.526 5.5 9.25 5.5H8.48L7.13 3.925Z" fill="#999999" />
            </svg>
            <div className="[letter-spacing:0em] [white-space-collapse:preserve] w-max font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold shrink-0 text-sm/5.75 text-[#353535]">
              Performance
            </div>
          </div>
          <div className="[letter-spacing:0em] h-6 text-right [white-space-collapse:preserve] w-max font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium whitespace-pre shrink-0 text-sm/5.75 text-[#858585]">
            long animation frames, INP, LCP<br />
          </div>
        </div>
        <div className="w-107.25 h-px bg-[#EEEEEE]" />
        <div className="flex items-center justify-between pt-2.5 pb-2.75 w-107.25" style={{ backgroundImage: 'linear-gradient(in oklab 90deg, oklab(100% 0 0) 0%, oklab(98.8% 0 0) 10.09%, oklab(98.9% 0 0) 90.46%, oklab(100% 0 0) 100%)' }}>
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: 'auto', flexShrink: '0' }}>
              <path fillRule="evenodd" clipRule="evenodd" d="M1.5 6.283C1.5 6.324 1.501 6.364 1.502 6.404C1.501 6.423 1.5 6.441 1.5 6.46C1.5 7.902 2.243 9.241 3.465 10.005L3.608 10.095L3.615 10.099L4.205 10.468L5.205 11.093C5.691 11.397 6.309 11.397 6.795 11.093L8.385 10.099C9.701 9.277 10.5 7.835 10.5 6.283V5.5V2.576C10.5 2.537 10.498 2.499 10.493 2.461C10.482 2.369 10.457 2.281 10.42 2.2C10.236 1.79 9.76 1.553 9.296 1.708L9.189 1.743C8.387 2.007 7.504 1.797 6.907 1.2C6.406 0.699 5.594 0.699 5.093 1.2C4.494 1.799 3.607 2.009 2.803 1.741L2.704 1.708C2.112 1.51 1.5 1.951 1.5 2.576V6.283ZM6.5 9.196V10.098L7.855 9.251C8.817 8.65 9.424 7.623 9.493 6.5H6.5V9.196ZM5.5 5.5V2.305V2.172C4.656 2.83 3.532 3.033 2.5 2.694V5.5H5.5Z" fill="#999999" />
            </svg>
            <div className="[letter-spacing:0em] [white-space-collapse:preserve] w-max font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold shrink-0 text-sm/5.75 text-[#353535]">
              Security
            </div>
          </div>
          <div className="[letter-spacing:0em] h-6 text-right [white-space-collapse:preserve] w-max font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium whitespace-pre shrink-0 text-sm/5.75 text-[#858585]">
            npm deps, CRSP attacks, vulns<br />
          </div>
        </div>
        <div className="w-107.25 h-px bg-[#EEEEEE]" />
        <div className="flex items-center justify-between pt-2.5 pb-2.75 w-107.25">
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: 'auto', flexShrink: '0' }}>
              <path fillRule="evenodd" clipRule="evenodd" d="M1 6C1 3.239 3.239 1 6 1C8.761 1 11 3.239 11 6C11 6.934 10.172 7.496 9.385 7.496H8.015C7.37 7.496 6.912 8.124 7.109 8.738L7.24 9.147C7.376 9.569 7.321 10.02 7.106 10.376C6.885 10.739 6.492 11 6 11C3.239 11 1 8.761 1 6ZM6.105 3.391C6.208 3.793 5.967 4.201 5.565 4.304C5.164 4.408 4.755 4.166 4.652 3.765C4.549 3.363 4.791 2.955 5.192 2.852C5.593 2.749 6.002 2.99 6.105 3.391ZM3.795 4.603C4.194 4.715 4.427 5.129 4.315 5.528C4.204 5.927 3.79 6.159 3.391 6.048C2.992 5.936 2.759 5.522 2.871 5.124C2.982 4.725 3.396 4.492 3.795 4.603ZM4.749 7.223C4.459 6.927 3.984 6.922 3.688 7.212C3.392 7.501 3.387 7.976 3.676 8.272C3.966 8.568 4.441 8.573 4.737 8.284C5.033 7.994 5.038 7.519 4.749 7.223ZM8.312 4.788C8.016 5.077 7.541 5.072 7.251 4.776C6.962 4.48 6.967 4.005 7.263 3.716C7.559 3.426 8.034 3.431 8.323 3.727C8.613 4.023 8.608 4.498 8.312 4.788Z" fill="#999999" />
            </svg>
            <div className="[letter-spacing:0em] [white-space-collapse:preserve] w-max font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold shrink-0 text-sm/5.75 text-[#353535]">
              Design tweaks
            </div>
          </div>
          <div className="[letter-spacing:0em] h-6 text-right [white-space-collapse:preserve] w-max font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium whitespace-pre shrink-0 text-sm/5.75 text-[#858585]">
            broken hover states, links, buttons<br />
          </div>
        </div>
        <div className="w-107.25 h-px bg-[#EEEEEE]" />
        <div className="flex items-center justify-between pt-2.5 pb-2.75 w-107.25" style={{ backgroundImage: 'linear-gradient(in oklab 90deg, oklab(100% 0 0) 0%, oklab(98.8% 0 0) 10.09%, oklab(98.9% 0 0) 90.46%, oklab(100% 0 0) 100%)' }}>
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: 'auto', flexShrink: '0' }}>
              <path fillRule="evenodd" clipRule="evenodd" d="M1 6C1 3.239 3.239 1 6 1C8.761 1 11 3.239 11 6C11 8.761 8.761 11 6 11C3.239 11 1 8.761 1 6ZM4.5 5.5C4.914 5.5 5.25 5.164 5.25 4.75C5.25 4.336 4.914 4 4.5 4C4.086 4 3.75 4.336 3.75 4.75C3.75 5.164 4.086 5.5 4.5 5.5ZM9.436 6.667C9.488 6.396 9.311 6.134 9.04 6.081C8.769 6.028 8.507 6.205 8.454 6.477C8.345 7.041 8.044 7.551 7.602 7.919C7.161 8.288 6.606 8.493 6.031 8.5C5.456 8.507 4.896 8.316 4.446 7.958C3.995 7.601 3.682 7.099 3.558 6.537C3.499 6.267 3.232 6.097 2.963 6.156C2.693 6.215 2.522 6.482 2.582 6.752C2.755 7.538 3.193 8.241 3.824 8.741C4.454 9.242 5.238 9.51 6.043 9.5C6.848 9.49 7.625 9.203 8.243 8.687C8.861 8.171 9.282 7.457 9.436 6.667ZM8.25 4.75C8.25 5.164 7.914 5.5 7.5 5.5C7.086 5.5 6.75 5.164 6.75 4.75C6.75 4.336 7.086 4 7.5 4C7.914 4 8.25 4.336 8.25 4.75Z" fill="#999999" />
            </svg>
            <div className="[letter-spacing:0em] [white-space-collapse:preserve] w-max font-['OpenRunde-Semibold','Open_Runde',system-ui,sans-serif] font-semibold shrink-0 text-sm/5.75 text-[#353535]">
              App completeness
            </div>
          </div>
          <div className="[letter-spacing:0em] h-6 text-right [white-space-collapse:preserve] w-max font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium shrink-0 text-sm/5.75 text-[#858585]">
            checks metadata
          </div>
        </div>
        <div className="flex flex-col gap-2.75 mt-8">
          <div className="[letter-spacing:0em] [white-space-collapse:preserve] w-max font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[15px]/5.75 text-[#454545]">
            Install the skill to get started
          </div>
          <div onClick={handleSelectCommand} className="items-center flex [font-synthesis-small-caps:none] [font-synthesis-style:none] [font-synthesis-weight:none] justify-between w-107.25 rounded-[11px] pt-2.75 pr-3 pb-2.75 pl-3.5 overflow-clip cursor-text [box-shadow:#C9C9C933_0px_2px_3px,#E9E9E9_0px_0px_0px_0.75px] transition-colors hover:bg-[color(display-p3_0.991_0.991_0.991)]" style={{ backgroundImage: 'linear-gradient(in oklab 180deg, oklab(100% 0 0) 0%, oklab(100% 0 0 / 0%) 100%)' }}>
            <div className="items-start flex min-w-0 gap-1">
              <div className="shrink-0 [letter-spacing:0px] w-3.75 font-['JetBrains_Mono',system-ui,sans-serif] font-medium text-sm/4.5 text-[#5C5C5C]">
                $
              </div>
              <div className="min-w-0 relative">
                <div ref={commandRef} className="[letter-spacing:0px] w-max font-['JetBrains_Mono',system-ui,sans-serif] font-medium text-sm/4.5 text-[#323232]">
                  npx -y expect-cli@latest init
                </div>
              </div>
            </div>
            <button onClick={(event) => { event.stopPropagation(); handleCopy(); }} className="cursor-pointer shrink-0 group" aria-label="Copy command">
              {copied && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '17px', height: 'auto' }}>
                  <path fillRule="evenodd" clipRule="evenodd" d="M10.28 3.22a.75.75 0 0 1 0 1.06l-5 5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06L4.75 7.69l4.47-4.47a.75.75 0 0 1 1.06 0Z" fill="#00C8B3" />
                </svg>
              )}
              {!copied && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '17px', height: 'auto' }} className="text-[#989898] group-hover:text-[#555555] transition-colors">
                  <path fillRule="evenodd" clipRule="evenodd" d="M3.25 2.25C3.25 1.698 3.698 1.25 4.25 1.25H9.25C10.079 1.25 10.75 1.922 10.75 2.75V7.75C10.75 8.302 10.302 8.75 9.75 8.75C9.474 8.75 9.25 8.526 9.25 8.25C9.25 7.974 9.474 7.75 9.75 7.75V2.75C9.75 2.474 9.526 2.25 9.25 2.25H4.25C4.25 2.526 4.026 2.75 3.75 2.75C3.474 2.75 3.25 2.526 3.25 2.25ZM1.25 4.75C1.25 3.922 1.922 3.25 2.75 3.25H7.25C8.078 3.25 8.75 3.922 8.75 4.75V9.25C8.75 10.079 8.078 10.75 7.25 10.75H2.75C1.922 10.75 1.25 10.079 1.25 9.25V4.75ZM2.75 4.25C2.474 4.25 2.25 4.474 2.25 4.75V9.25C2.25 9.526 2.474 9.75 2.75 9.75H7.25C7.526 9.75 7.75 9.526 7.75 9.25V4.75C7.75 4.474 7.526 4.25 7.25 4.25H2.75Z" fill="currentColor" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <div className="flex flex-col w-107.25 mt-8">
          <div className="h-[0.5px] self-stretch shrink-0 bg-[#DDDDDD] mb-2.75" />
          {[
            { question: "How is this different from Puppeteer / Playwright / Cypress?", answer: "Instead of writing scripts, maintaining selectors, and wiring up assertions, Expect reads your code changes and tests them in a real browser automatically. It's like giving your agent QA superpowers." },
            { question: "How is this different from coding agents or computer-use tools?", answer: "Your agent needs to verify its work, and general-purpose browser tools rely on screenshots and mouse coordinates.\n\nExpect is purpose-built for testing: it uses Playwright for fast DOM automation, reads your code changes, generates a test plan, and runs it with your real cookies, then reports back what's broken so the agent can fix it." },
            { question: "How does it fit into my workflow?", answer: "Your coding agent calls /expect as a skill whenever it needs to validate its work in a real browser. You can also trigger it from CI by adding the GitHub Action to test every PR automatically before merge." },
            { question: "Does it work in CI?", answer: "Yes. Use --ci or the add github-action command to set up a workflow that tests every PR. In CI mode it runs headless, skips cookie extraction, auto-approves the plan, and enforces a 30-minute timeout." },
            { question: "Can this do mobile / desktop testing?", answer: "Coming soon." },
            { question: "Is there a cloud or enterprise version?", answer: "Coming soon. Email aiden@million.dev if you have questions or ideas." },
          ].map((faq, index) => (
            <div key={index} onClick={() => setOpenFaqs((previous) => { const next = new Set(previous); if (next.has(index)) { next.delete(index); } else { next.add(index); } return next; })} className="cursor-pointer group/faq pb-2.75">
              <div className="flex justify-between items-start transition-colors group-hover/faq:text-[#1E1E1E] pt-2.75">
                <div className={`[letter-spacing:0em] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[14px]/5.75 transition-colors group-hover/faq:text-[#1E1E1E] ${openFaqs.has(index) ? "text-[#1E1E1E]" : "text-[#5A5A5A]"}`}>
                  {faq.question}
                </div>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '20px', height: 'auto', flexShrink: '0' }} className={`group-hover/faq:text-[#1E1E1E] transition-all duration-200 ${openFaqs.has(index) ? "text-[#1E1E1E] rotate-45" : "text-[#5A5A5A]"}`}>
                  <path fillRule="evenodd" clipRule="evenodd" d="M6.5 3C6.5 2.724 6.276 2.5 6 2.5C5.724 2.5 5.5 2.724 5.5 3V5.5H3C2.724 5.5 2.5 5.724 2.5 6C2.5 6.276 2.724 6.5 3 6.5H5.5V9C5.5 9.276 5.724 9.5 6 9.5C6.276 9.5 6.5 9.276 6.5 9V6.5H9C9.276 6.5 9.5 6.276 9.5 6C9.5 5.724 9.276 5.5 9 5.5H6.5V3Z" fill="currentColor" />
                </svg>
              </div>
              <div className={`grid transition-[grid-template-rows,opacity] duration-200 ${openFaqs.has(index) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="[letter-spacing:0em] font-['OpenRunde-Medium','Open_Runde',system-ui,sans-serif] font-medium text-[14px]/5.5 text-[#858585] whitespace-pre-line mt-1.5">
                    {faq.answer}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
