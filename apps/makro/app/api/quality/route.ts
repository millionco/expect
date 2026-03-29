import { NextResponse } from "next/server";
import { getQualityReport } from "@/lib/get-makro-data";

export const GET = async () => {
  const qualityReport = await getQualityReport();

  return NextResponse.json(qualityReport);
};
