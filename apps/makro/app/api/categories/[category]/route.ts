import { NextResponse } from "next/server";
import { getCategoryByCode } from "@/lib/get-makro-data";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ category: string }> },
) => {
  const { category } = await params;
  const categoryData = await getCategoryByCode(category);

  if (!categoryData) {
    return NextResponse.json(
      {
        status: "not_found",
        category,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(categoryData);
};
