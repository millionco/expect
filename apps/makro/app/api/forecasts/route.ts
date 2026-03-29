import { NextResponse } from "next/server";
import { getEvdsForecastFeed } from "@/lib/get-evds-forecast-feed";
import { getForecastComparisonRows } from "@/lib/get-forecast-comparison-rows";
import { getInternalForecastFeed } from "@/lib/get-internal-forecast-feed";

export const GET = async () => {
  const [evdsForecastFeed, internalForecastFeed] = await Promise.all([
    getEvdsForecastFeed(),
    getInternalForecastFeed(),
  ]);

  return NextResponse.json({
    officialSeriesCount: evdsForecastFeed.configuredSeriesCount,
    internalSeriesCount: internalForecastFeed.entries.length,
    internalForecastFilePath: internalForecastFeed.filePath,
    rows: getForecastComparisonRows(evdsForecastFeed.series, internalForecastFeed.entries),
  });
};
