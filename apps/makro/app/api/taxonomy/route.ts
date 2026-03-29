import { NextResponse } from "next/server";
import { getTaxonomyReport } from "@/lib/get-makro-data";

export const GET = async () => {
  const taxonomyReport = await getTaxonomyReport();

  return NextResponse.json(taxonomyReport);
};
