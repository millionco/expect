import { NextResponse } from "next/server";
import { filterComponents, getMakroData } from "@/lib/get-makro-data";

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const indicatorCode = searchParams.get("indicatorCode") ?? "";
  const makroData = await getMakroData();
  const components = filterComponents(makroData.indicatorComponents, {
    q,
    indicatorCode,
  });

  return NextResponse.json({
    filters: {
      q,
      indicatorCode,
    },
    count: components.length,
    components,
  });
};
