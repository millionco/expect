import { NextResponse } from "next/server";
import { getEvdsForecastFeed } from "@/lib/get-evds-forecast-feed";
import { getLiveDashboardFeed } from "@/lib/get-live-dashboard-feed";

export const GET = async () => {
  const [liveDashboardFeed, evdsForecastFeed] = await Promise.all([
    getLiveDashboardFeed(),
    getEvdsForecastFeed(),
  ]);

  return NextResponse.json({
    ...liveDashboardFeed,
    evdsForecastFeed,
  });
};
