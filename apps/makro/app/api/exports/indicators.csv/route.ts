import { NextResponse } from "next/server";
import { getMakroData } from "@/lib/get-makro-data";
import { toCsv } from "@/lib/to-csv";

export const GET = async () => {
  const makroData = await getMakroData();
  const csv = toCsv(
    [
      "indicator_code",
      "indicator_name",
      "category",
      "frequency",
      "unit",
      "value_type",
      "seasonal_adjustment",
      "base_year",
      "description_short",
      "component_count",
    ],
    makroData.indicators.map((indicator) => [
      indicator.indicatorCode,
      indicator.indicatorName,
      indicator.category,
      indicator.frequency,
      indicator.unit,
      indicator.valueType,
      indicator.seasonalAdjustment,
      indicator.baseYear,
      indicator.descriptionShort,
      indicator.components.length,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="makro-indicators.csv"',
    },
  });
};
