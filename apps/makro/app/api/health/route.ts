import { NextResponse } from "next/server";
import { getMakroData } from "@/lib/get-makro-data";

export const GET = async () => {
  const makroData = await getMakroData();

  return NextResponse.json({
    status: "ok",
    dataSource: makroData.dataSource,
    databaseTarget: makroData.databaseTarget,
    seedLoaded: makroData.indicators.length > 0 && makroData.sources.length > 0,
    fallbackReason: makroData.fallbackReason,
    counts: makroData.counts,
  });
};
