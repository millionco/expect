import { NextResponse } from "next/server";
import { filterIndicators, getMakroData } from "@/lib/get-makro-data";

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const frequency = searchParams.get("frequency") ?? "";
  const makroData = await getMakroData();
  const indicators = filterIndicators(makroData.indicators, {
    q,
    category,
    frequency,
  });

  return NextResponse.json({
    filters: {
      q,
      category,
      frequency,
    },
    count: indicators.length,
    indicators,
  });
};
