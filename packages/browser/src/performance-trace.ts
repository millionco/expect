import type { ExpectRuntime } from "./generated/runtime-types";

type PerformanceTrace = ReturnType<ExpectRuntime["getPerformanceTrace"]>;

const BLOCKING_DURATION_POOR_MS = 150;
const FORCED_LAYOUT_WARN_MS = 30;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const formatMs = (ms: number): string => `${Math.round(ms)}ms`;

export const formatPerformanceTrace = (trace: PerformanceTrace): string => {
  const lines: string[] = [];

  lines.push("# Performance Trace");
  lines.push("");

  lines.push("## Web Vitals");
  lines.push("");
  const { webVitals } = trace;
  if (webVitals.fcp) lines.push(`- **FCP**: ${webVitals.fcp.value}ms (${webVitals.fcp.rating})`);
  if (webVitals.lcp) lines.push(`- **LCP**: ${webVitals.lcp.value}ms (${webVitals.lcp.rating})`);
  if (webVitals.cls) lines.push(`- **CLS**: ${webVitals.cls.value} (${webVitals.cls.rating})`);
  if (webVitals.inp) lines.push(`- **INP**: ${webVitals.inp.value}ms (${webVitals.inp.rating})`);
  if (!webVitals.fcp && !webVitals.lcp && !webVitals.cls && !webVitals.inp) {
    lines.push("No web vitals collected yet.");
  }
  lines.push("");

  if (trace.navigation) {
    lines.push("## Navigation Timing");
    lines.push("");
    lines.push(`- **TTFB**: ${formatMs(trace.navigation.ttfb)}`);
    lines.push(`- **DOM Content Loaded**: ${formatMs(trace.navigation.domContentLoaded)}`);
    lines.push(`- **Load Complete**: ${formatMs(trace.navigation.loadComplete)}`);
    if (trace.navigation.redirectDuration > 0) {
      lines.push(`- **Redirect Duration**: ${formatMs(trace.navigation.redirectDuration)}`);
    }
    if (trace.navigation.serverTiming.length > 0) {
      lines.push("");
      lines.push("### Server Timing");
      for (const entry of trace.navigation.serverTiming) {
        const desc = entry.description ? ` — ${entry.description}` : "";
        lines.push(`- **${entry.name}**: ${formatMs(entry.duration)}${desc}`);
      }
    }
    lines.push("");
  }

  if (trace.longAnimationFrames.length > 0) {
    lines.push("## Long Animation Frames (LoAF)");
    lines.push("");
    lines.push(`${trace.longAnimationFrames.length} long animation frames detected.`);
    lines.push("");

    const sorted = [...trace.longAnimationFrames].sort(
      (left, right) => right.blockingDuration - left.blockingDuration,
    );

    for (const [index, frame] of sorted.entries()) {
      const interactionTag = frame.firstUIEventTimestamp > 0 ? " [user interaction]" : "";
      const severity = frame.blockingDuration > BLOCKING_DURATION_POOR_MS ? " ⚠ POOR" : "";
      lines.push(`### Frame ${index + 1}${interactionTag}${severity}`);
      lines.push("");
      lines.push(`- **Duration**: ${formatMs(frame.duration)}`);
      lines.push(`- **Blocking Duration**: ${formatMs(frame.blockingDuration)}`);
      lines.push(`- **Render Start**: ${formatMs(frame.renderStart)}`);
      lines.push(`- **Style & Layout Start**: ${formatMs(frame.styleAndLayoutStart)}`);
      if (frame.firstUIEventTimestamp > 0) {
        lines.push(`- **First UI Event**: ${formatMs(frame.firstUIEventTimestamp)}`);
      }

      if (frame.scripts.length > 0) {
        lines.push("");
        lines.push("**Scripts:**");
        lines.push("");
        for (const script of frame.scripts) {
          const functionName = script.sourceFunctionName || "(anonymous)";
          const source = script.sourceURL
            ? `${script.sourceURL}:${script.sourceCharPosition}`
            : "(unknown source)";
          const layoutWarn =
            script.forcedStyleAndLayoutDuration > FORCED_LAYOUT_WARN_MS
              ? ` ⚠ forced layout: ${formatMs(script.forcedStyleAndLayoutDuration)}`
              : "";
          lines.push(`- \`${functionName}\` — ${formatMs(script.duration)}${layoutWarn}`);
          lines.push(`  - Invoker: ${script.invoker} (${script.invokerType})`);
          lines.push(`  - Source: ${source}`);
        }
      }
      lines.push("");
    }
  }

  lines.push("## Resources");
  lines.push("");
  lines.push(
    `${trace.resources.totalCount} resources loaded — ${formatBytes(trace.resources.totalTransferSizeBytes)} total transfer size.`,
  );

  if (trace.resources.slowest.length > 0) {
    lines.push("");
    lines.push("### Slowest Resources");
    lines.push("");
    for (const resource of trace.resources.slowest) {
      lines.push(
        `- ${formatMs(resource.duration)} — ${resource.name} (${resource.initiatorType}, ${formatBytes(resource.transferSize)})`,
      );
    }
  }

  if (trace.resources.largest.length > 0) {
    lines.push("");
    lines.push("### Largest Resources");
    lines.push("");
    for (const resource of trace.resources.largest) {
      if (resource.transferSize === 0) continue;
      lines.push(
        `- ${formatBytes(resource.transferSize)} — ${resource.name} (${resource.initiatorType}, ${formatMs(resource.duration)})`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
};
