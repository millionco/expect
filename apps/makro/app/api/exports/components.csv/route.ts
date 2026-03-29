import { NextResponse } from "next/server";
import { getMakroData } from "@/lib/get-makro-data";
import { toCsv } from "@/lib/to-csv";

export const GET = async () => {
  const makroData = await getMakroData();
  const csv = toCsv(
    [
      "indicator_code",
      "component_code",
      "component_name",
      "description",
      "sort_order",
    ],
    makroData.indicatorComponents.map((component) => [
      component.indicatorCode,
      component.componentCode,
      component.componentName,
      component.description,
      component.sortOrder,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="makro-components.csv"',
    },
  });
};
