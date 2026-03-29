import { NextResponse } from "next/server";
import { getMakroData } from "@/lib/get-makro-data";

export const GET = async () => {
  const makroData = await getMakroData();

  return NextResponse.json({
    counts: makroData.counts,
    categories: makroData.categories,
    topSources: makroData.sources.slice(0, 5),
    featuredIndicators: makroData.indicators.slice(0, 6),
  });
};
