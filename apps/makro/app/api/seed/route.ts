import { NextResponse } from "next/server";
import { getMakroData } from "@/lib/get-makro-data";

export const GET = async () => {
  const makroData = await getMakroData();

  return NextResponse.json({
    dataSource: makroData.dataSource,
    databaseTarget: makroData.databaseTarget,
    fallbackReason: makroData.fallbackReason,
    filePath: makroData.filePath,
    counts: makroData.counts,
    countries: makroData.countries,
    sources: makroData.sources,
    indicators: makroData.indicators,
  });
};
