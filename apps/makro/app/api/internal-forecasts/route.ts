import { NextResponse } from "next/server";
import { getInternalForecastFeed } from "@/lib/get-internal-forecast-feed";

export const dynamic = "force-dynamic";

export const GET = async () => {
  const feed = await getInternalForecastFeed();
  return NextResponse.json(feed);
};
