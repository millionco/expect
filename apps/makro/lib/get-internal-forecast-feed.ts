import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

export interface InternalForecastEntry {
  key: string;
  value?: number;
  note: string;
  detailHref: string;
}

export interface InternalForecastFeed {
  filePath: string;
  updatedAt?: string;
  entries: InternalForecastEntry[];
  missing: boolean;
}

const INTERNAL_FORECAST_FILE_PATH = path.join(process.cwd(), "data", "internal-forecasts.json");

const parseNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const parseEntry = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.key !== "string") {
    return undefined;
  }

  return {
    key: candidate.key,
    value: parseNumber(candidate.value),
    note:
      typeof candidate.note === "string" && candidate.note.trim().length > 0
        ? candidate.note
        : "İç tahmin girilmedi.",
    detailHref:
      typeof candidate.detailHref === "string" && candidate.detailHref.trim().length > 0
        ? candidate.detailHref
        : "/live",
  } satisfies InternalForecastEntry;
};

export const getInternalForecastFeed = cache(async () => {
  try {
    const content = await readFile(INTERNAL_FORECAST_FILE_PATH, "utf8");
    const raw = JSON.parse(content) as unknown;
    const parsed = raw && typeof raw === "object" ? raw : {};
    const forecasts = "forecasts" in parsed ? parsed.forecasts : undefined;
    const updatedAt = "updatedAt" in parsed ? parsed.updatedAt : undefined;
    const entries = Array.isArray(forecasts)
      ? forecasts.flatMap((entry) => {
          const parsedEntry = parseEntry(entry);
          return parsedEntry ? [parsedEntry] : [];
        })
      : [];

    return {
      filePath: INTERNAL_FORECAST_FILE_PATH,
      updatedAt: typeof updatedAt === "string" ? updatedAt : undefined,
      entries,
      missing: false,
    } satisfies InternalForecastFeed;
  } catch {
    return {
      filePath: INTERNAL_FORECAST_FILE_PATH,
      updatedAt: undefined,
      entries: [],
      missing: true,
    } satisfies InternalForecastFeed;
  }
});
