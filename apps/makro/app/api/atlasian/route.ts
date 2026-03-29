import { NextResponse } from "next/server";
import { runAtlasianForecast } from "@/lib/get-atlasian-forecast";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

// GET: Analizi çalıştır ve döndür (kaydetmez)
export const GET = async () => {
  const synthesis = await runAtlasianForecast();
  return NextResponse.json(synthesis);
};

// POST: Analizi çalıştır ve internal-forecasts.json'ı güncelle
export const POST = async () => {
  const synthesis = await runAtlasianForecast();

  if (synthesis.error || synthesis.forecasts.length === 0) {
    return NextResponse.json(
      { success: false, error: synthesis.error ?? "Tahmin üretilemedi", synthesis },
      { status: 422 },
    );
  }

  const internalForecasts = {
    updatedAt: new Date().toISOString().slice(0, 10),
    generatedBy: "ATLASIAN",
    forecasts: synthesis.forecasts.map((f) => ({
      key: f.key,
      value: f.value,
      note: `[ATLASIAN ${new Date().toLocaleDateString("tr-TR")}] ${f.rationale}`,
      detailHref: f.key.includes("tufe")
        ? "/indicators/CPI_YOY"
        : f.key.includes("faiz")
          ? "/indicators/POLICY_RATE"
          : "/live",
    })),
  };

  const filePath = path.join(process.cwd(), "data", "internal-forecasts.json");
  await writeFile(filePath, JSON.stringify(internalForecasts, null, 2), "utf8");

  return NextResponse.json({ success: true, synthesis });
};
