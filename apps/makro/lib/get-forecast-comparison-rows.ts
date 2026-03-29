import type { EvdsForecastFeed } from "@/lib/get-evds-forecast-feed";
import type { InternalForecastFeed } from "@/lib/get-internal-forecast-feed";

export interface ForecastComparisonRow {
  key: string;
  title: string;
  officialValue: string;
  officialDate: string;
  internalValue: string;
  internalStatus: string;
  difference: string;
  detailHref: string;
  detailLabel: string;
}

const formatValue = (value: number | undefined, prefix = "", suffix = "") => {
  if (value === undefined) {
    return "Girilmedi";
  }

  return `${prefix}${value.toFixed(2)}${suffix}`;
};

const formatDifference = (officialValue: number | undefined, internalValue: number | undefined) => {
  if (officialValue === undefined || internalValue === undefined) {
    return "Bekliyor";
  }

  const difference = internalValue - officialValue;

  if (difference > 0) {
    return `+${difference.toFixed(2)}`;
  }

  return difference.toFixed(2);
};

export const getDifferenceToneClassName = (value: string) => {
  if (value === "Bekliyor") {
    return "border-white/55 bg-white/72 text-muted-foreground dark:border-white/10 dark:bg-white/5";
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "border-white/55 bg-white/72 text-muted-foreground dark:border-white/10 dark:bg-white/5";
  }

  if (numericValue >= 2) {
    return "border-rose-300/40 bg-rose-400/10 text-rose-700 dark:border-rose-200/20 dark:bg-rose-300/10 dark:text-rose-100";
  }

  if (numericValue > 0) {
    return "border-amber-300/40 bg-amber-400/10 text-amber-800 dark:border-amber-200/20 dark:bg-amber-300/10 dark:text-amber-100";
  }

  if (numericValue <= -2) {
    return "border-emerald-300/40 bg-emerald-400/10 text-emerald-800 dark:border-emerald-200/20 dark:bg-emerald-300/10 dark:text-emerald-100";
  }

  return "border-sky-300/40 bg-sky-400/10 text-sky-800 dark:border-sky-200/20 dark:bg-sky-300/10 dark:text-sky-100";
};

export const getForecastComparisonRows = (
  officialSeries: EvdsForecastFeed["series"],
  internalEntries: InternalForecastFeed["entries"],
) => {
  const internalEntryMap = new Map(internalEntries.map((entry) => [entry.key, entry]));

  return officialSeries.flatMap((series) => {
    if (series.status !== "ready" || !series.latest) {
      return [];
    }

    const internalEntry = internalEntryMap.get(series.key);
    const detailHref = internalEntry?.detailHref ?? "/live";
    const detailLabel = detailHref.startsWith("/indicators/") ? "Gösterge detayı" : "Canlı veri";
    const officialValue = series.latest.value;
    const internalValue = internalEntry?.value;

    return [
      {
        key: series.key,
        title: series.label,
        officialValue: formatValue(officialValue),
        officialDate: series.latest.date,
        internalValue: formatValue(internalValue),
        internalStatus: internalEntry?.note ?? "İç tahmin girilmedi.",
        difference: formatDifference(officialValue, internalValue),
        detailHref,
        detailLabel,
      } satisfies ForecastComparisonRow,
    ];
  });
};
