import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getAtlasianSnapshot,
  refreshAtlasianSnapshot,
} from "@/lib/get-atlasian-snapshot";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const synthesis = forceRefresh
    ? await refreshAtlasianSnapshot()
    : await getAtlasianSnapshot();

  return NextResponse.json(synthesis);
};

export const POST = async () => {
  const synthesis = await refreshAtlasianSnapshot();

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
