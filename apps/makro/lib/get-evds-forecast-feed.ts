import { cache } from "react";
import { LIVE_FEED_REVALIDATE_SECONDS, LIVE_FEED_TIMEOUT_MS } from "@/lib/constants";

interface EvdsSeriesConfig {
  key: string;
  label: string;
  envVar: string;
  defaultSeriesCode: string;
}

interface EvdsSeriesPoint {
  date: string;
  value: number;
}

export interface EvdsSeriesSnapshot {
  key: string;
  label: string;
  seriesCode: string;
  latest?: EvdsSeriesPoint;
  history: EvdsSeriesPoint[];
  status: "ready" | "fetch_error";
  error?: string;
}

export interface EvdsForecastFeed {
  enabled: boolean;
  configuredSeriesCount: number;
  requiredEnvVars: string[];
  series: EvdsSeriesSnapshot[];
  notes: string[];
}

interface EvdsPayloadRecord {
  Tarih?: string;
  [key: string]: unknown;
}

const EVDS_FE_URL = "https://evds3.tcmb.gov.tr/igmevdsms-dis/fe";

const getEvdsSeriesConfigs = (): EvdsSeriesConfig[] => [
  {
    key: "yil-sonu-tufe",
    label: "Yıl Sonu TÜFE Beklentisi",
    envVar: "EVDS_YEAR_END_CPI_EXPECTATION_SERIES",
    defaultSeriesCode: "TP.PKAUO.S01.D.U",
  },
  {
    key: "on-iki-ay-sonrasi-tufe",
    label: "12 Ay Sonrası TÜFE Beklentisi",
    envVar: "EVDS_12M_CPI_EXPECTATION_SERIES",
    defaultSeriesCode: "TP.PKAUO.S01.E.U",
  },
  {
    key: "ilk-toplanti-politika-faizi",
    label: "İlk Toplantı Politika Faizi Beklentisi",
    envVar: "EVDS_POLICY_RATE_EXPECTATION_SERIES",
    defaultSeriesCode: "TP.PKAUO.S04.C.U",
  },
  {
    key: "on-iki-ay-sonrasi-politika-faizi",
    label: "12 Ay Sonrası Politika Faizi Beklentisi",
    envVar: "EVDS_12M_POLICY_RATE_EXPECTATION_SERIES",
    defaultSeriesCode: "TP.PKAUO.S04.D.U",
  },
  {
    key: "yil-sonu-usd-try",
    label: "Yıl Sonu USD/TRY Beklentisi",
    envVar: "EVDS_USDTRY_EXPECTATION_SERIES",
    defaultSeriesCode: "TP.PKAUO.S05.B.U",
  },
  {
    key: "on-iki-ay-sonrasi-usd-try",
    label: "12 Ay Sonrası USD/TRY Beklentisi",
    envVar: "EVDS_12M_USDTRY_EXPECTATION_SERIES",
    defaultSeriesCode: "TP.PKAUO.S05.C.U",
  },
];

const buildDateString = (date: Date) => {
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = `${date.getFullYear()}`;

  return `${day}-${month}-${year}`;
};

const getEvdsDateRange = () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 2);

  return {
    startDate: buildDateString(startDate),
    endDate: buildDateString(endDate),
  };
};

const parseNumericValue = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readSeriesValue = (record: EvdsPayloadRecord, seriesCode: string) => {
  const normalizedCode = seriesCode.replaceAll(".", "_");
  const exactValue = parseNumericValue(record[seriesCode]);

  if (exactValue !== undefined) {
    return exactValue;
  }

  const normalizedValue = parseNumericValue(record[normalizedCode]);
  if (normalizedValue !== undefined) {
    return normalizedValue;
  }

  return undefined;
};

const buildSeriesHistory = (records: EvdsPayloadRecord[], seriesCode: string) =>
  records
    .flatMap((record) => {
      const value = readSeriesValue(record, seriesCode);

      if (value === undefined) {
        return [];
      }

      return [
        {
          date: record.Tarih ?? "Tarih yok",
          value,
        } satisfies EvdsSeriesPoint,
      ];
    })
    .slice(-8);

const fetchEvdsPayload = async (seriesCodes: string[]) => {
  const { startDate, endDate } = getEvdsDateRange();
  const response = await fetch(EVDS_FE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "json",
      series: seriesCodes.join("-"),
      aggregationTypes: seriesCodes.map(() => "last").join("-"),
      formulas: seriesCodes.map(() => "0").join("-"),
      startDate,
      endDate,
      frequency: "5",
      decimalSeperator: ".",
      decimal: "2",
      dateFormat: "1",
      lang: "tr",
      yon: "",
      sira: "",
      ozelFormuller: [],
      groupSeperator: true,
      isRaporSayfasi: false,
    }),
    next: { revalidate: LIVE_FEED_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(LIVE_FEED_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`EVDS3 ${response.status}`);
  }

  return (await response.json()) as { items?: EvdsPayloadRecord[] };
};

export const getEvdsForecastFeed = cache(async () => {
  const seriesConfigs = getEvdsSeriesConfigs().map((config) => ({
    ...config,
    seriesCode: process.env[config.envVar] ?? config.defaultSeriesCode,
  }));
  const requiredEnvVars = seriesConfigs.map((config) => config.envVar);

  try {
    const payload = await fetchEvdsPayload(seriesConfigs.map((config) => config.seriesCode));
    const records = Array.isArray(payload.items) ? payload.items : [];
    const latestRecord = [...records]
      .reverse()
      .find((record) =>
        seriesConfigs.some((config) => readSeriesValue(record, config.seriesCode) !== undefined),
      );

    const series = seriesConfigs.map((config) => {
      const history = buildSeriesHistory(records, config.seriesCode);
      const latestPoint = history.at(-1);
      const latestValue = latestRecord ? readSeriesValue(latestRecord, config.seriesCode) : undefined;

      if (latestRecord && latestValue !== undefined && latestPoint) {
        return {
          key: config.key,
          label: config.label,
          seriesCode: config.seriesCode,
          latest: latestPoint,
          history,
          status: "ready",
        } satisfies EvdsSeriesSnapshot;
      }

      return {
        key: config.key,
        label: config.label,
        seriesCode: config.seriesCode,
        history,
        status: "fetch_error",
        error: "EVDS3 yanıtında okunabilir son değer bulunamadı.",
      } satisfies EvdsSeriesSnapshot;
    });

    return {
      enabled: series.some((entry) => entry.status === "ready"),
      configuredSeriesCount: series.filter((entry) => entry.status === "ready").length,
      requiredEnvVars,
      series,
      notes: [
        "EVDS3 resmi JSON endpoint'i kullanılıyor: /igmevdsms-dis/fe",
        "Seri kodları EVDS arayüzünden otomatik doğrulandı; istersen ortam değişkenleriyle override edebilirsin.",
      ],
    } satisfies EvdsForecastFeed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const series = seriesConfigs.map((config) => ({
      key: config.key,
      label: config.label,
      seriesCode: config.seriesCode,
      history: [],
      status: "fetch_error",
      error: message,
    })) satisfies EvdsSeriesSnapshot[];

    return {
      enabled: false,
      configuredSeriesCount: 0,
      requiredEnvVars,
      series,
      notes: [
        "EVDS3 sayısal tahmin akışı bu ortamda çekilemedi.",
        message,
      ],
    } satisfies EvdsForecastFeed;
  }
});
