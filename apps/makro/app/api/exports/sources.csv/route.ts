import { NextResponse } from "next/server";
import { getMakroData } from "@/lib/get-makro-data";
import { toCsv } from "@/lib/to-csv";

export const GET = async () => {
  const makroData = await getMakroData();
  const csv = toCsv(
    [
      "source_code",
      "source_name",
      "source_type",
      "base_url",
      "is_primary_source",
      "reliability_score",
      "notes",
    ],
    makroData.sources.map((source) => [
      source.sourceCode,
      source.sourceName,
      source.sourceType,
      source.baseUrl,
      source.isPrimarySource,
      source.reliabilityScore,
      source.notes,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="makro-sources.csv"',
    },
  });
};
