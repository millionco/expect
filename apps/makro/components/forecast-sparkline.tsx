interface ForecastSparklinePoint {
  date: string;
  value: number;
}

const SPARKLINE_WIDTH = 240;
const SPARKLINE_HEIGHT = 72;
const SPARKLINE_PADDING = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const buildCoordinates = (points: ReadonlyArray<ForecastSparklinePoint>) => {
  if (points.length === 0) {
    return [];
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step =
    points.length > 1
      ? (SPARKLINE_WIDTH - SPARKLINE_PADDING * 2) / (points.length - 1)
      : 0;

  return points.map((point, index) => {
    const normalized = (point.value - min) / range;
    const x = SPARKLINE_PADDING + step * index;
    const y = clamp(
      SPARKLINE_HEIGHT - SPARKLINE_PADDING - normalized * (SPARKLINE_HEIGHT - SPARKLINE_PADDING * 2),
      SPARKLINE_PADDING,
      SPARKLINE_HEIGHT - SPARKLINE_PADDING,
    );

    return { ...point, x, y };
  });
};

const formatDelta = (delta: number) => {
  if (delta > 0) {
    return `+${delta.toFixed(2)}`;
  }

  return delta.toFixed(2);
};

export const ForecastSparkline = ({
  points,
  accentClassName,
}: Readonly<{
  points: ReadonlyArray<ForecastSparklinePoint>;
  accentClassName?: string;
}>) => {
  const coordinates = buildCoordinates(points);
  const linePoints = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPoints = [
    `${SPARKLINE_PADDING},${SPARKLINE_HEIGHT - SPARKLINE_PADDING}`,
    ...coordinates.map((point) => `${point.x},${point.y}`),
    `${SPARKLINE_WIDTH - SPARKLINE_PADDING},${SPARKLINE_HEIGHT - SPARKLINE_PADDING}`,
  ].join(" ");
  const latestPoint = points.at(-1);
  const previousPoint = points.at(-2);
  const delta = latestPoint && previousPoint ? latestPoint.value - previousPoint.value : undefined;
  const positive = delta !== undefined && delta >= 0;
  const deltaTone = positive ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300";
  const strokeClassName = accentClassName ?? "stroke-accent";
  const fillClassName = positive
    ? "fill-emerald-500/12 dark:fill-emerald-300/12"
    : "fill-rose-500/12 dark:fill-rose-300/12";

  return (
    <div className="rounded-[1.4rem] border border-white/45 bg-white/55 p-3 backdrop-blur dark:border-white/10 dark:bg-white/4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Son 8 dönem
        </p>
        {delta !== undefined && (
          <p className={`text-xs font-medium ${deltaTone}`}>{formatDelta(delta)}</p>
        )}
      </div>

      <div className="mt-3">
        <svg
          viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
          className="h-[4.5rem] w-full"
          aria-hidden="true"
        >
          <path
            d={`M ${SPARKLINE_PADDING} ${SPARKLINE_HEIGHT - SPARKLINE_PADDING} H ${SPARKLINE_WIDTH - SPARKLINE_PADDING}`}
            className="stroke-border/80"
            strokeWidth="1"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          {coordinates.length > 1 && (
            <polygon className={fillClassName} points={areaPoints} />
          )}
          {coordinates.length > 1 && (
            <polyline
              className={strokeClassName}
              points={linePoints}
              fill="none"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {coordinates.at(-1) && (
            <circle
              cx={coordinates.at(-1)?.x}
              cy={coordinates.at(-1)?.y}
              r="3.5"
              className="fill-accent stroke-background"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>{points[0]?.date ?? "Başlangıç yok"}</span>
        <span>{latestPoint?.date ?? "Son tarih yok"}</span>
      </div>
    </div>
  );
};
