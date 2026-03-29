import { NextResponse } from "next/server";
import { getSourceByCode } from "@/lib/get-makro-data";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ sourceCode: string }> },
) => {
  const { sourceCode } = await params;
  const source = await getSourceByCode(sourceCode);

  if (!source) {
    return NextResponse.json(
      {
        status: "not_found",
        sourceCode,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(source);
};
