import { cache } from "react";
import { LIVE_FEED_REVALIDATE_SECONDS, LIVE_FEED_TIMEOUT_MS } from "@/lib/constants";

interface ExchangeQuote {
  code: string;
  name: string;
  forexSelling: number;
}

interface ExchangeSnapshot {
  date: string;
  bulletinNo: string;
  quotes: ExchangeQuote[];
}

interface ForecastRelease {
  key: string;
  title: string;
  period: string;
  sourcePageUrl: string;
  reportUrl?: string;
  tableUrl?: string;
  note: string;
}

interface CalendarRelease {
  key: string;
  title: string;
  topicTitle: string;
  period: string;
  releaseAt: string;
  dataGroupCode: string;
}

export interface LiveDashboardFeed {
  fetchedAt: string;
  exchangeSnapshot?: ExchangeSnapshot;
  forecastReleases: ForecastRelease[];
  calendarReleases: CalendarRelease[];
  limitations: string[];
}

const EXCHANGE_XML_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const PARTICIPANTS_SURVEY_URL =
  "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Egilim+Anketleri/Piyasa+Katilimcilari+Anketi";
const SECTORAL_EXPECTATIONS_URL =
  "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Egilim+Anketleri/Sektorel+Enflasyon+Beklentileri";
const MONTHLY_CALENDAR_URL = "https://evds3.tcmb.gov.tr/igmevdsms-dis/calendar/aylikYayinlar";

const extractAbsoluteUrl = (value: string, baseUrl: string) => new URL(value, baseUrl).href;

const extractTagValue = (xml: string, currencyCode: string, tagName: string) => {
  const currencyMatch = xml.match(
    new RegExp(
      `<Currency[^>]*CurrencyCode="${currencyCode}"[\\s\\S]*?<${tagName}>(.*?)<\\/${tagName}>`,
      "i",
    ),
  );

  return currencyMatch?.[1]?.trim();
};

const decodeHtmlEntities = (value: string) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&uuml;", "ü")
    .replaceAll("&Uuml;", "Ü")
    .replaceAll("&ouml;", "ö")
    .replaceAll("&Ouml;", "Ö")
    .replaceAll("&ccedil;", "ç")
    .replaceAll("&Ccedil;", "Ç")
    .replaceAll("&nbsp;", " ");

const fetchText = async (url: string) => {
  const response = await fetch(url, {
    next: { revalidate: LIVE_FEED_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(LIVE_FEED_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.text();
};

const fetchJson = async <T,>(url: string) => {
  const response = await fetch(url, {
    next: { revalidate: LIVE_FEED_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(LIVE_FEED_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return (await response.json()) as T;
};

const loadExchangeSnapshot = async () => {
  const xml = await fetchText(EXCHANGE_XML_URL);
  const rootMatch = xml.match(/<Tarih_Date[^>]*Tarih="([^"]+)"[^>]*Bulten_No="([^"]+)"/i);

  if (!rootMatch) {
    throw new Error("TCMB kur XML kök bilgisi ayrıştırılamadı");
  }

  const codes = ["USD", "EUR", "GBP"];
  const quotes = codes.flatMap((code) => {
    const forexSelling = extractTagValue(xml, code, "ForexSelling");
    const name = extractTagValue(xml, code, "Isim");

    if (!forexSelling || !name) {
      return [];
    }

    return [
      {
        code,
        name,
        forexSelling: Number(forexSelling.replace(",", ".")),
      } satisfies ExchangeQuote,
    ];
  });

  return {
    date: rootMatch[1],
    bulletinNo: rootMatch[2],
    quotes,
  } satisfies ExchangeSnapshot;
};

const loadForecastRelease = async (
  key: string,
  title: string,
  sourcePageUrl: string,
  valueLabel: string,
) => {
  const html = await fetchText(sourcePageUrl);
  const periodMatch = html.match(/Aylık Gelişmeler\s*-\s*([^<]+)<\/h2>/i);
  const reportMatch = html.match(
    /Aylık Gelişmeler[\s\S]{0,2000}?href="([^"]+?\.pdf[^"]*)"/i,
  );
  const tableMatch = html.match(/Veri \(Tablolar\)[\s\S]{0,2000}?href="([^"]+?\.pdf[^"]*)"/i);

  if (!periodMatch) {
    throw new Error(`${title} son yayın dönemi ayrıştırılamadı`);
  }

  return {
    key,
    title,
    period: decodeHtmlEntities(periodMatch[1].trim()),
    sourcePageUrl,
    reportUrl: reportMatch ? extractAbsoluteUrl(decodeHtmlEntities(reportMatch[1]), sourcePageUrl) : undefined,
    tableUrl: tableMatch ? extractAbsoluteUrl(decodeHtmlEntities(tableMatch[1]), sourcePageUrl) : undefined,
    note: `${valueLabel} için son yayın dönemi bulundu. Sayısal zaman serisi ayrıca EVDS3 JSON katmanından gösterilir.`,
  } satisfies ForecastRelease;
};

const parseCalendarDate = (value: string) => new Date(value.replace(" ", "T") + ":00+03:00");

const loadCalendarReleases = async () => {
  const now = new Date();
  const url = new URL(MONTHLY_CALENDAR_URL);
  url.searchParams.set("yil", `${now.getFullYear()}`);
  url.searchParams.set("ay", `${now.getMonth() + 1}`);

  const payload = await fetchJson<
    Array<{
      id: string;
      period: string;
      donem: string;
      tarih: string;
      yayinBilgi?: {
        yayimAdi?: string;
        veriGrubuKodu?: string;
        topicTitleTr?: string;
      };
    }>
  >(url.toString());

  return payload
    .slice()
    .sort(
      (left, right) =>
        Math.abs(parseCalendarDate(left.tarih).getTime() - now.getTime()) -
        Math.abs(parseCalendarDate(right.tarih).getTime() - now.getTime()),
    )
    .slice(0, 6)
    .map((entry) => ({
      key: entry.id,
      title: decodeHtmlEntities(entry.yayinBilgi?.yayimAdi?.trim() ?? "Yayın adı yok"),
      topicTitle: decodeHtmlEntities(entry.yayinBilgi?.topicTitleTr?.trim() ?? "Konu başlığı yok"),
      period: decodeHtmlEntities(entry.donem.trim() || entry.period.trim()),
      releaseAt: entry.tarih,
      dataGroupCode: entry.yayinBilgi?.veriGrubuKodu ?? "bilinmiyor",
    })) satisfies CalendarRelease[];
};

export const getLiveDashboardFeed = cache(async () => {
  const [exchangeResult, participantsResult, sectoralResult, calendarResult] = await Promise.allSettled([
    loadExchangeSnapshot(),
    loadForecastRelease(
      "piyasa-katilimcilari",
      "TCMB Piyasa Katılımcıları Anketi",
      PARTICIPANTS_SURVEY_URL,
      "Piyasa beklentisi",
    ),
    loadForecastRelease(
      "sektorel-enflasyon",
      "TCMB Sektörel Enflasyon Beklentileri",
      SECTORAL_EXPECTATIONS_URL,
      "Sektörel enflasyon beklentisi",
    ),
    loadCalendarReleases(),
  ]);

  const limitations: string[] = [];

  const exchangeSnapshot = exchangeResult.status === "fulfilled" ? exchangeResult.value : undefined;

  if (exchangeResult.status === "rejected") {
    limitations.push(
      `TCMB günlük kur akışı çekilemedi: ${exchangeResult.reason instanceof Error ? exchangeResult.reason.message : String(exchangeResult.reason)}`,
    );
  }

  const forecastReleases: ForecastRelease[] = [];

  for (const result of [participantsResult, sectoralResult]) {
    if (result.status === "fulfilled") {
      forecastReleases.push(result.value);
      continue;
    }

    limitations.push(
      `Tahmin yayın akışı çekilemedi: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
    );
  }

  const calendarReleases = calendarResult.status === "fulfilled" ? calendarResult.value : [];

  if (calendarResult.status === "rejected") {
    limitations.push(
      `EVDS yayın takvimi çekilemedi: ${calendarResult.reason instanceof Error ? calendarResult.reason.message : String(calendarResult.reason)}`,
    );
  }

  const liveDashboardFeed: LiveDashboardFeed = {
    fetchedAt: new Date().toISOString(),
    exchangeSnapshot,
    forecastReleases,
    calendarReleases,
    limitations,
  };

  return liveDashboardFeed;
});
