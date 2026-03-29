import { NextResponse } from "next/server";
import { getIndicatorByCode } from "@/lib/get-makro-data";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ indicatorCode: string }> },
) => {
  const { indicatorCode } = await params;
  const indicator = await getIndicatorByCode(indicatorCode);

  if (!indicator) {
    return NextResponse.json(
      {
        status: "not_found",
        indicatorCode,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(indicator);
};
