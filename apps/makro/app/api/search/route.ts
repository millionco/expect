import { NextResponse } from "next/server";
import { searchMakroData } from "@/lib/get-makro-data";

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const results = await searchMakroData(q);

  return NextResponse.json({
    query: q,
    count: results.length,
    results,
  });
};
