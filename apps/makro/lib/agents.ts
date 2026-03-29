import { AGENT_CHECK_TIMEOUT_MS } from "@/lib/constants";

export type AgentStatus = "ok" | "warning" | "error" | "unknown";
export type AgentCategory = "makro" | "haber" | "sistem";

export interface AgentCheckResult {
  id: string;
  label: string;
  category: AgentCategory;
  status: AgentStatus;
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

const fetchWithTimeout = async (url: string) => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(AGENT_CHECK_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
};

// ─── TCMB Günlük Kur Ajanı ────────────────────────────────────────────────────
export const checkTcmbCurrencyAgent = async (): Promise<AgentCheckResult> => {
  const id = "tcmb-kur";
  const label = "TCMB Günlük Kur";
  const category: AgentCategory = "makro";
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetchWithTimeout("https://www.tcmb.gov.tr/kurlar/today.xml");
    const xml = await response.text();
    const dateMatch = xml.match(/Tarih="([^"]+)"/);
    const bulletinMatch = xml.match(/Bulten_No="([^"]+)"/);

    if (!dateMatch) {
      return { id, label, category, status: "warning", message: "XML ayrıştırılamadı, tarih bulunamadı", checkedAt };
    }

    const xmlDate = dateMatch[1];
    const todayTr = new Date().toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const isToday = xmlDate === todayTr;
    const quoteCount = (xml.match(/<Currency /gi) ?? []).length;

    return {
      id,
      label,
      category,
      status: isToday ? "ok" : "warning",
      message: isToday
        ? `Bugün güncellendi — ${quoteCount} kur, bülten ${bulletinMatch?.[1] ?? "?"}`
        : `Son güncelleme: ${xmlDate} (bugün değil)`,
      checkedAt,
      details: { date: xmlDate, bulletinNo: bulletinMatch?.[1], quoteCount, isToday },
    };
  } catch (error) {
    return {
      id,
      label,
      category,
      status: "error",
      message: `TCMB kur XML erişilemiyor: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
    };
  }
};

// ─── EVDS3 Tahmin Serileri Ajanı ─────────────────────────────────────────────
const EVDS_FORECAST_URL = "https://evds3.tcmb.gov.tr/igmevdsms-dis/fe";
const EVDS_EXPECTED_SERIES_COUNT = 6;

export const checkEvdsForecastAgent = async (): Promise<AgentCheckResult> => {
  const id = "evds-tahmin";
  const label = "EVDS3 Tahmin Serileri";
  const category: AgentCategory = "makro";
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetchWithTimeout(EVDS_FORECAST_URL);
    const data = (await response.json()) as unknown;

    if (!Array.isArray(data)) {
      return {
        id,
        label,
        category,
        status: "warning",
        message: "EVDS3 beklenmedik yanıt formatı — dizi bekleniyor",
        checkedAt,
      };
    }

    const foundCount = data.length;
    const total = EVDS_EXPECTED_SERIES_COUNT;
    const status: AgentStatus =
      foundCount >= total ? "ok" : foundCount > 0 ? "warning" : "error";

    return {
      id,
      label,
      category,
      status,
      message:
        foundCount >= total
          ? `${foundCount} seri hazır`
          : `${foundCount}/${total} seri hazır — bazı seriler eksik`,
      checkedAt,
      details: { foundCount, total },
    };
  } catch (error) {
    return {
      id,
      label,
      category,
      status: "error",
      message: `EVDS3 tahmin API erişilemiyor: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
    };
  }
};

// ─── EVDS Yayın Takvimi Ajanı ─────────────────────────────────────────────────
export const checkEvdsCalendarAgent = async (): Promise<AgentCheckResult> => {
  const id = "evds-takvim";
  const label = "EVDS Yayın Takvimi";
  const category: AgentCategory = "makro";
  const checkedAt = new Date().toISOString();

  try {
    const now = new Date();
    const url = new URL("https://evds3.tcmb.gov.tr/igmevdsms-dis/calendar/aylikYayinlar");
    url.searchParams.set("yil", `${now.getFullYear()}`);
    url.searchParams.set("ay", `${now.getMonth() + 1}`);

    const response = await fetchWithTimeout(url.toString());
    const data = (await response.json()) as unknown;

    if (!Array.isArray(data)) {
      return { id, label, category, status: "warning", message: "Takvim verisi ayrıştırılamadı", checkedAt };
    }

    const upcoming = data.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.tarih !== "string") return false;
      return new Date(candidate.tarih.replace(" ", "T") + ":00+03:00") > now;
    });

    return {
      id,
      label,
      category,
      status: upcoming.length > 0 ? "ok" : "warning",
      message:
        upcoming.length > 0
          ? `${upcoming.length} yaklaşan yayın — takvim güncel`
          : "Bu ay için yaklaşan yayın bulunamadı",
      checkedAt,
      details: { totalEntries: data.length, upcomingCount: upcoming.length },
    };
  } catch (error) {
    return {
      id,
      label,
      category,
      status: "error",
      message: `EVDS takvim API erişilemiyor: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
    };
  }
};

// ─── İç Tahmin Dosyası Ajanı ─────────────────────────────────────────────────
const STALE_FORECAST_DAYS = 30;

export const checkInternalForecastAgent = async (): Promise<AgentCheckResult> => {
  const id = "ic-tahmin";
  const label = "İç Tahmin Dosyası";
  const category: AgentCategory = "sistem";
  const checkedAt = new Date().toISOString();

  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const filePath = join(process.cwd(), "data", "internal-forecasts.json");
    const content = await readFile(filePath, "utf8");
    const raw = JSON.parse(content) as unknown;

    if (!raw || typeof raw !== "object") {
      return { id, label, category, status: "error", message: "Geçersiz JSON formatı", checkedAt };
    }

    const candidate = raw as Record<string, unknown>;
    const updatedAt = typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined;
    const forecasts = Array.isArray(candidate.forecasts) ? candidate.forecasts : [];
    const filledCount = forecasts.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const e = entry as Record<string, unknown>;
      return typeof e.value === "number" && Number.isFinite(e.value);
    }).length;

    const isStale =
      updatedAt !== undefined &&
      (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24) > STALE_FORECAST_DAYS;

    return {
      id,
      label,
      category,
      status: isStale ? "warning" : filledCount === forecasts.length ? "ok" : "warning",
      message: isStale
        ? `Eski veri: ${updatedAt} — ${filledCount}/${forecasts.length} tahmin dolu`
        : `${filledCount}/${forecasts.length} tahmin dolu — güncelleme: ${updatedAt ?? "bilinmiyor"}`,
      checkedAt,
      details: { updatedAt, filledCount, total: forecasts.length, isStale },
    };
  } catch (error) {
    const isNotFound =
      error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
    return {
      id,
      label,
      category,
      status: "error",
      message: isNotFound
        ? "data/internal-forecasts.json bulunamadı"
        : `Dosya okunamadı: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
    };
  }
};

// ─── Veritabanı / Seed Modu Ajanı ────────────────────────────────────────────
export const checkDatabaseAgent = async (): Promise<AgentCheckResult> => {
  const id = "veritabani";
  const label = "Veri Kaynağı";
  const category: AgentCategory = "sistem";
  const checkedAt = new Date().toISOString();

  try {
    const { getMakroData } = await import("@/lib/get-makro-data");
    const data = await getMakroData();

    return {
      id,
      label,
      category,
      status: data.dataSource === "database" ? "ok" : "warning",
      message:
        data.dataSource === "database"
          ? `Canlı veritabanı — ${data.indicators.length} gösterge, ${data.sources.length} kaynak`
          : `Seed modu — ${data.indicators.length} gösterge (veritabanı bağlantısı yok)`,
      checkedAt,
      details: {
        mode: data.dataSource,
        indicatorCount: data.indicators.length,
        sourceCount: data.sources.length,
        categoryCount: data.categories.length,
      },
    };
  } catch (error) {
    return {
      id,
      label,
      category,
      status: "error",
      message: `Veri kaynağı okunamadı: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
    };
  }
};

// ─── Haber Kaynakları Ajanı ───────────────────────────────────────────────────
export const NEWS_RSS_SOURCES = [
  { id: "bloomberg-ht", label: "Bloomberg HT", url: "https://www.bloomberght.com/rss" },
  { id: "sabah-ekonomi", label: "Sabah Ekonomi", url: "https://www.sabah.com.tr/rss/ekonomi.xml" },
  { id: "hurriyet-ekonomi", label: "Hürriyet Ekonomi", url: "https://www.hurriyet.com.tr/rss/ekonomi" },
  { id: "ntv-ekonomi", label: "NTV Ekonomi", url: "https://www.ntv.com.tr/ekonomi/rss" },
  { id: "milliyet-ekonomi", label: "Milliyet Ekonomi", url: "https://www.milliyet.com.tr/rss/rssnews/ekonomi.xml" },
  { id: "dunya-gazetesi", label: "Dünya Gazetesi", url: "https://www.dunya.com/rss/ekonomi.xml" },
  { id: "ekonomi-gazetesi", label: "Ekonomi Gazetesi", url: "https://www.ekonomigazetesi.com.tr/rss/guncel.xml" },
  { id: "cnnturk-ekonomi", label: "CNN Türk Ekonomi", url: "https://www.cnnturk.com/feed/rss/ekonomi/news" },
  { id: "haberturk-ekonomi", label: "Habertürk Ekonomi", url: "https://www.haberturk.com/rss/ekonomi.xml" },
  { id: "aa-ekonomi", label: "Anadolu Ajansı Ekonomi", url: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi" },
] as const;

export const checkNewsSourcesAgent = async (): Promise<AgentCheckResult> => {
  const id = "haber-kaynaklari";
  const label = "Haber Kaynakları";
  const category: AgentCategory = "haber";
  const checkedAt = new Date().toISOString();

  const results = await Promise.allSettled(
    NEWS_RSS_SOURCES.map(async (source) => {
      const response = await fetchWithTimeout(source.url);
      return { label: source.label, ok: response.ok };
    }),
  );

  const okCount = results.filter((r) => r.status === "fulfilled").length;
  const total = NEWS_RSS_SOURCES.length;
  const failedLabels = results.flatMap((result, index) =>
    result.status === "rejected" ? [NEWS_RSS_SOURCES[index].label] : [],
  );

  return {
    id,
    label,
    category,
    status: okCount === total ? "ok" : okCount >= Math.ceil(total / 2) ? "warning" : "error",
    message:
      okCount === total
        ? `${total}/${total} kaynak erişilebilir`
        : `${okCount}/${total} kaynak erişilebilir${failedLabels.length > 0 ? ` — erişilemiyor: ${failedLabels.slice(0, 3).join(", ")}${failedLabels.length > 3 ? " +" + (failedLabels.length - 3) : ""}` : ""}`,
    checkedAt,
    details: { okCount, total, failedLabels },
  };
};

// ─── Tüm Ajanları Çalıştır ───────────────────────────────────────────────────
export const runAllAgents = async (): Promise<AgentCheckResult[]> => {
  const checks = [
    checkTcmbCurrencyAgent,
    checkEvdsForecastAgent,
    checkEvdsCalendarAgent,
    checkInternalForecastAgent,
    checkDatabaseAgent,
    checkNewsSourcesAgent,
  ];

  const results = await Promise.allSettled(checks.map((check) => check()));

  return results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    return {
      id: `agent-${index}`,
      label: "Bilinmeyen Ajan",
      category: "sistem" as AgentCategory,
      status: "error" as AgentStatus,
      message: `Ajan çalıştırma hatası: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      checkedAt: new Date().toISOString(),
    };
  });
};
