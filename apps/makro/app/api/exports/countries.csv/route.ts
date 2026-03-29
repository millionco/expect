import { NextResponse } from "next/server";
import { getMakroData } from "@/lib/get-makro-data";
import { toCsv } from "@/lib/to-csv";

export const GET = async () => {
  const makroData = await getMakroData();
  const csv = toCsv(
    ["iso_code", "name", "currency_code"],
    makroData.countries.map((country) => [
      country.isoCode,
      country.name,
      country.currencyCode,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="makro-countries.csv"',
    },
  });
};
