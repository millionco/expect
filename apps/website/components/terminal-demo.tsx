"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { DEMO_CHAR_INTERVAL_MS, DEMO_LINE_PAUSE_MS, DEMO_PROMPT_PAUSE_MS } from "@/constants";

type LineStyle = "prompt" | "muted" | "default" | "success" | "fail";

interface OutputLine {
  text: string;
  style: LineStyle;
}

const STYLE_CLASSES: Record<LineStyle, string> = {
  prompt: "text-foreground font-semibold",
  muted: "text-muted-foreground",
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  fail: "text-red-500 dark:text-red-400",
};

interface CommandOutput {
  lines: OutputLine[];
}

const COMMANDS: Record<string, CommandOutput> = {
  testie: {
    lines: [
      { text: "◆ 3 changed files detected", style: "default" },
      { text: "  src/cart.tsx  src/checkout.tsx  src/api/orders.ts", style: "muted" },
      { text: "", style: "muted" },
      { text: "◆ Planning browser tests...", style: "default" },
      { text: "  1. Add item to cart", style: "muted" },
      { text: "  2. Navigate to checkout", style: "muted" },
      { text: "  3. Complete purchase", style: "muted" },
      { text: "", style: "muted" },
      { text: "◆ Running against http://localhost:3000", style: "default" },
      { text: "  ✓ Add item to cart", style: "success" },
      { text: "  ✓ Navigate to checkout", style: "success" },
      { text: "  ✗ Complete purchase — submit button not found", style: "fail" },
      { text: "", style: "muted" },
      { text: "◆ 2 passed, 1 failed", style: "default" },
    ],
  },
  "testie unstaged": {
    lines: [
      { text: "◆ 3 changed files detected", style: "default" },
      { text: "  src/cart.tsx  src/checkout.tsx  src/api/orders.ts", style: "muted" },
      { text: "", style: "muted" },
      { text: "◆ Planning browser tests...", style: "default" },
      { text: "  1. Add item to cart", style: "muted" },
      { text: "  2. Navigate to checkout", style: "muted" },
      { text: "  3. Complete purchase", style: "muted" },
      { text: "", style: "muted" },
      { text: "◆ Running against http://localhost:3000", style: "default" },
      { text: "  ✓ Add item to cart", style: "success" },
      { text: "  ✓ Navigate to checkout", style: "success" },
      { text: "  ✗ Complete purchase — submit button not found", style: "fail" },
      { text: "", style: "muted" },
      { text: "◆ 2 passed, 1 failed", style: "default" },
    ],
  },
  "testie branch": {
    lines: [
      { text: "◆ Comparing against main...", style: "default" },
      { text: "  12 files changed across 4 commits", style: "muted" },
      { text: "", style: "muted" },
      { text: "◆ Planning browser tests...", style: "default" },
      { text: "  1. Verify new settings page renders", style: "muted" },
      { text: "  2. Toggle dark mode preference", style: "muted" },
      { text: "  3. Save profile changes", style: "muted" },
      { text: "  4. Check notification preferences", style: "muted" },
      { text: "", style: "muted" },
      { text: "◆ Running against http://localhost:3000", style: "default" },
      { text: "  ✓ Verify new settings page renders", style: "success" },
      { text: "  ✓ Toggle dark mode preference", style: "success" },
      { text: "  ✓ Save profile changes", style: "success" },
      { text: "  ✓ Check notification preferences", style: "success" },
      { text: "", style: "muted" },
      { text: "◆ 4 passed, 0 failed", style: "default" },
    ],
  },
  "testie -f checkout-flow": {
    lines: [
      { text: "◆ Loading saved flow: checkout-flow", style: "default" },
      { text: "", style: "muted" },
      { text: "◆ Replaying 5 test steps...", style: "default" },
      { text: "  1. Navigate to /products", style: "muted" },
      { text: "  2. Add item to cart", style: "muted" },
      { text: "  3. Open cart drawer", style: "muted" },
      { text: "  4. Proceed to checkout", style: "muted" },
      { text: "  5. Submit payment", style: "muted" },
      { text: "", style: "muted" },
      { text: "◆ Running against http://localhost:3000", style: "default" },
      { text: "  ✓ Navigate to /products", style: "success" },
      { text: "  ✓ Add item to cart", style: "success" },
      { text: "  ✓ Open cart drawer", style: "success" },
      { text: "  ✓ Proceed to checkout", style: "success" },
      { text: "  ✓ Submit payment", style: "success" },
      { text: "", style: "muted" },
      { text: "◆ 5 passed, 0 failed", style: "default" },
    ],
  },
  "testie --help": {
    lines: [
      { text: "Usage: testie [command] [options]", style: "default" },
      { text: "", style: "muted" },
      { text: "Commands:", style: "default" },
      { text: "  unstaged          test current unstaged changes (default)", style: "muted" },
      { text: "  branch            test full branch diff vs main", style: "muted" },
      { text: "", style: "muted" },
      { text: "Options:", style: "default" },
      { text: "  -m, --message     natural language test instruction", style: "muted" },
      { text: "  -f, --flow        reuse a saved flow by slug", style: "muted" },
      { text: "  -y, --yes         skip plan review, run immediately", style: "muted" },
      { text: "  --headed          run browser visibly", style: "muted" },
      { text: "  -v, --version     print version", style: "muted" },
      { text: "  -h, --help        display help", style: "muted" },
    ],
  },
  "testie -h": {
    lines: [
      { text: "Usage: testie [command] [options]", style: "default" },
      { text: "", style: "muted" },
      { text: "Commands:", style: "default" },
      { text: "  unstaged          test current unstaged changes (default)", style: "muted" },
      { text: "  branch            test full branch diff vs main", style: "muted" },
      { text: "", style: "muted" },
      { text: "Options:", style: "default" },
      { text: "  -m, --message     natural language test instruction", style: "muted" },
      { text: "  -f, --flow        reuse a saved flow by slug", style: "muted" },
      { text: "  -y, --yes         skip plan review, run immediately", style: "muted" },
      { text: "  --headed          run browser visibly", style: "muted" },
      { text: "  -v, --version     print version", style: "muted" },
      { text: "  -h, --help        display help", style: "muted" },
    ],
  },
  clear: { lines: [] },
};

const AUTO_DEMO_COMMAND = "testie unstaged";

export const TerminalDemo = () => {
  const [history, setHistory] = useState<OutputLine[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const animateOutput = useCallback(
    (lines: OutputLine[], onDone: () => void) => {
      setIsAnimating(true);
      let index = 0;

      const nextLine = () => {
        if (index >= lines.length) {
          setIsAnimating(false);
          onDone();
          return;
        }

        const line = lines[index];
        index += 1;

        setHistory((previous) => [...previous, line]);
        setTimeout(scrollToBottom, 0);

        const isSection = line.text.startsWith("◆");
        const delay = isSection ? DEMO_PROMPT_PAUSE_MS : DEMO_LINE_PAUSE_MS;

        timeoutRef.current = setTimeout(
          nextLine,
          line.text === "" ? DEMO_LINE_PAUSE_MS / 2 : delay,
        );
      };

      timeoutRef.current = setTimeout(nextLine, DEMO_LINE_PAUSE_MS);
    },
    [scrollToBottom],
  );

  const runCommand = useCallback(
    (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;

      setHistory((previous) => [...previous, { text: `$ ${trimmed}`, style: "prompt" }]);

      if (trimmed === "clear") {
        setHistory([]);
        return;
      }

      const output = COMMANDS[trimmed];
      if (output) {
        animateOutput(output.lines, () => {
          inputRef.current?.focus();
        });
      } else {
        setHistory((previous) => [
          ...previous,
          { text: `command not found: ${trimmed}`, style: "fail" },
          { text: "try: testie, testie branch, testie --help", style: "muted" },
        ]);
        setTimeout(scrollToBottom, 0);
      }
    },
    [animateOutput, scrollToBottom],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isAnimating) return;
    const command = inputValue;
    setInputValue("");
    runCommand(command);
  };

  useEffect(() => {
    let charIndex = 0;
    const fullCommand = AUTO_DEMO_COMMAND;

    setHistory([{ text: "$ ", style: "prompt" }]);

    const typeChar = () => {
      if (charIndex < fullCommand.length) {
        charIndex += 1;
        setHistory([{ text: `$ ${fullCommand.slice(0, charIndex)}`, style: "prompt" }]);
        timeoutRef.current = setTimeout(typeChar, DEMO_CHAR_INTERVAL_MS);
      } else {
        const output = COMMANDS[fullCommand];
        if (output) {
          animateOutput(output.lines, () => {
            setShowInput(true);
            setTimeout(() => inputRef.current?.focus(), 100);
          });
        }
      }
    };

    timeoutRef.current = setTimeout(typeChar, DEMO_PROMPT_PAUSE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [animateOutput]);

  const handleContainerClick = () => {
    if (showInput && !isAnimating) {
      inputRef.current?.focus();
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <div className="size-2 rounded-full bg-foreground/15" />
        <div className="size-2 rounded-full bg-foreground/15" />
        <div className="size-2 rounded-full bg-foreground/15" />
      </div>
      <div
        ref={scrollRef}
        onClick={handleContainerClick}
        className="flex h-[280px] cursor-text flex-col overflow-y-auto p-3 font-mono text-xs leading-5"
      >
        {history.map((line, index) => (
          <div key={index} className={line.text === "" ? "h-5" : STYLE_CLASSES[line.style]}>
            {line.text}
          </div>
        ))}
        {showInput && (
          <form onSubmit={handleSubmit} className="flex items-center">
            <span className="font-semibold text-foreground">$ </span>
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              disabled={isAnimating}
              className="flex-1 bg-transparent text-foreground caret-foreground outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {!isAnimating && (
              <motion.span
                className="ml-px inline-block h-3.5 w-[5px] translate-y-px bg-foreground"
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
                style={{ display: inputValue.length > 0 ? "none" : "inline-block" }}
              />
            )}
          </form>
        )}
      </div>
    </>
  );
};
