import { NextResponse } from "next/server";
import { getMakroData } from "@/lib/get-makro-data";

export const GET = async () => {
  const makroData = await getMakroData();
  const categories = makroData.categories.map((category) => {
    const indicators = makroData.indicators.filter(
      (indicator) => indicator.category === category.category,
    );

    return {
      ...category,
      componentCount: indicators.reduce(
        (total, indicator) => total + indicator.components.length,
        0,
      ),
    };
  });

  return NextResponse.json({
    count: categories.length,
    categories,
  });
};
