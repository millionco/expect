"use client";

import { createContext, useState, useCallback, useContext, useMemo, useRef } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

interface SlidingHighlightPosition {
  top: number;
  left: number;
  height: number;
  width: number;
}

interface SlidingHighlightContextValue {
  setActiveElement: (element: HTMLElement | null, variant?: string) => void;
}

const SlidingHighlightContext = createContext<SlidingHighlightContextValue>({
  setActiveElement: () => {},
});

interface SlidingHighlightConfig {
  className?: string;
  lineHeight?: number;
}

const useSlidingHighlight = (config: SlidingHighlightConfig = {}) => {
  const [highlightPosition, setHighlightPosition] = useState<SlidingHighlightPosition | null>(null);
  const [highlightVariant, setHighlightVariant] = useState("default");

  const setActiveElement = useCallback(
    (element: HTMLElement | null, variant = "default") => {
      if (!element) {
        setHighlightPosition(null);
        return;
      }
      setHighlightVariant(variant);
      if (config.lineHeight != null) {
        const parent = element.parentElement;
        const style = getComputedStyle(element);
        const paddingLeft = parseFloat(style.paddingLeft);
        const paddingRight = parseFloat(style.paddingRight);
        setHighlightPosition({
          top: parent ? parent.offsetHeight - config.lineHeight : 0,
          left: element.offsetLeft + paddingLeft,
          height: config.lineHeight,
          width: element.offsetWidth - paddingLeft - paddingRight,
        });
      } else {
        setHighlightPosition({
          top: element.offsetTop,
          left: element.offsetLeft,
          height: element.offsetHeight,
          width: element.offsetWidth,
        });
      }
    },
    [config.lineHeight],
  );

  const contextValue = useMemo(() => ({ setActiveElement }), [setActiveElement]);

  const clearHighlight = useCallback(() => {
    setHighlightPosition(null);
  }, []);

  const highlightElement = highlightPosition ? (
    <motion.div
      className={cn(
        "pointer-events-none absolute top-0 left-0 -z-10 rounded-sm",
        highlightVariant === "destructive"
          ? "bg-destructive/10 dark:bg-destructive/20"
          : (config.className ?? "bg-accent"),
      )}
      initial={false}
      animate={{
        x: highlightPosition.left,
        y: highlightPosition.top,
        width: highlightPosition.width,
        height: highlightPosition.height,
      }}
      transition={{ type: "spring", bounce: 0.1, duration: 0.15 }}
    />
  ) : null;

  return {
    contextValue,
    clearHighlight,
    highlightElement,
    highlightVariant,
  };
};

const useSlidingHighlightItem = (variant = "default") => {
  const itemRef = useRef<HTMLElement>(null);
  const { setActiveElement } = useContext(SlidingHighlightContext);

  const handlePointerEnter = useCallback(() => {
    setActiveElement(itemRef.current, variant);
  }, [setActiveElement, variant]);

  const handleFocus = useCallback(() => {
    setActiveElement(itemRef.current, variant);
  }, [setActiveElement, variant]);

  return { itemRef, handlePointerEnter, handleFocus };
};

export { SlidingHighlightContext, useSlidingHighlight, useSlidingHighlightItem };
