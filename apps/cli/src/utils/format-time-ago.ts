import {
  DAYS_PER_MONTH,
  DAYS_PER_WEEK,
  MONTHS_PER_YEAR,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
} from "../constants";

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

export const formatTimeAgo = (timestampMs: number, nowMs: number = Date.now()): string => {
  const deltaMs = timestampMs - nowMs;
  const absoluteDeltaMs = Math.abs(deltaMs);

  if (absoluteDeltaMs < MS_PER_MINUTE) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaMs / MS_PER_SECOND), "second");
  }

  if (absoluteDeltaMs < MS_PER_HOUR) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaMs / MS_PER_MINUTE), "minute");
  }

  if (absoluteDeltaMs < MS_PER_DAY) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaMs / MS_PER_HOUR), "hour");
  }

  if (absoluteDeltaMs < MS_PER_DAY * DAYS_PER_WEEK) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaMs / MS_PER_DAY), "day");
  }

  if (absoluteDeltaMs < MS_PER_DAY * DAYS_PER_MONTH) {
    return RELATIVE_TIME_FORMATTER.format(
      Math.round(deltaMs / (MS_PER_DAY * DAYS_PER_WEEK)),
      "week",
    );
  }

  if (absoluteDeltaMs < MS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR) {
    return RELATIVE_TIME_FORMATTER.format(
      Math.round(deltaMs / (MS_PER_DAY * DAYS_PER_MONTH)),
      "month",
    );
  }

  return RELATIVE_TIME_FORMATTER.format(
    Math.round(deltaMs / (MS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR)),
    "year",
  );
};
