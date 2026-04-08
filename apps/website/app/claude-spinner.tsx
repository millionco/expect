"use client";

import { useEffect, useRef, useState } from "react";

const GLYPH_CHARACTERS = ["·", "✢", "✳", "✶", "✻", "✽"];
const SPINNER_FRAMES = [
  ...GLYPH_CHARACTERS,
  ...[...GLYPH_CHARACTERS].reverse(),
];
const GLYPH_INTERVAL_MS = 120;
const GLIMMER_SPEED_MS = 200;
const BASE_COLOR = "#D74B25";
const SHIMMER_COLOR = "#FF8C6B";

export function ClaudeSpinner({ message }: { message: string }) {
  const [time, setTime] = useState(0);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();
    const tick = (now: number) => {
      setTime(now - startRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const frame = Math.floor(time / GLYPH_INTERVAL_MS);
  const glyph = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];

  const cycleLength = message.length + 20;
  const cyclePosition = Math.floor(time / GLIMMER_SPEED_MS);
  const glimmerIndex =
    message.length + 10 - (cyclePosition % cycleLength);

  const characters = message.split("").map((character, index) => {
    const distance = Math.abs(index - glimmerIndex);
    const isShimmer = distance <= 1;
    return (
      <span key={index} style={{ color: isShimmer ? SHIMMER_COLOR : BASE_COLOR }}>
        {character}
      </span>
    );
  });

  return (
    <div className="flex items-center shrink-0 gap-1.25">
      <div
        className="inline-block font-['BerkeleyMono-Regular','Berkeley_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5"
        style={{ color: BASE_COLOR }}
      >
        {glyph}
      </div>
      <div className="[letter-spacing:0px] inline-block font-['JetBrains_Mono',system-ui,sans-serif] shrink-0 text-[12.5px]/4.5">
        {characters}
      </div>
    </div>
  );
}
