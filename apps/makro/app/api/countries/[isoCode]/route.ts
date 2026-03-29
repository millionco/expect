import { NextResponse } from "next/server";
import { getCountryByIsoCode } from "@/lib/get-makro-data";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ isoCode: string }> },
) => {
  const { isoCode } = await params;
  const country = await getCountryByIsoCode(isoCode);

  if (!country) {
    return NextResponse.json(
      {
        status: "not_found",
        isoCode,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(country);
};
