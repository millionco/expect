import { NEWS_FEED_REVALIDATE_SECONDS, NEWS_ITEMS_PER_SOURCE } from "@/lib/constants";

export interface NewsItem {
  id: string;
  sourceId: string;
  sourceLabel: string;
  title: string;
  description?: string;
  link: string;
  publishedAt: string;
}

export interface NewsFeedSource {
  id: string;
  label: string;
  url: string;
  category: "finans" | "ekonomi" | "resmi";
}

export interface NewsFeed {
  items: NewsItem[];
  sources: Array<{ id: string; label: string; ok: boolean; itemCount: number }>;
  fetchedAt: string;
}

// ─── Kaynak Tanımları ─────────────────────────────────────────────────────────
// 21+ kaynak: 5 ATLASIAN yabancı kaynak + yerli ekonomi gazeteleri
export const NEWS_FEED_SOURCES: ReadonlyArray<NewsFeedSource> = [
  // ── ATLASIAN Yabancı Kaynaklar (WSJ, CNBC, CoinDesk, Yahoo, Investing.com) ──
  { id: "wsj-markets", label: "WSJ Markets", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", category: "finans" },
  { id: "cnbc-economy", label: "CNBC Economy", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", category: "finans" },
  { id: "coindesk", label: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "finans" },
  { id: "yahoo-finance", label: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex", category: "finans" },
  { id: "investing-tr", label: "Investing.com TR", url: "https://tr.investing.com/rss/news_25.rss", category: "finans" },
  // ── Yerli Finans ──────────────────────────────────────────────────────────────
  { id: "bloomberg-ht", label: "Bloomberg HT", url: "https://www.bloomberght.com/rss", category: "finans" },
  { id: "haberturk-ekonomi", label: "Habertürk Ekonomi", url: "https://www.haberturk.com/rss/ekonomi.xml", category: "finans" },
  // ── Ekonomi Gazeteleri ────────────────────────────────────────────────────────
  { id: "sabah-ekonomi", label: "Sabah Ekonomi", url: "https://www.sabah.com.tr/rss/ekonomi.xml", category: "ekonomi" },
  { id: "hurriyet-ekonomi", label: "Hürriyet Ekonomi", url: "https://www.hurriyet.com.tr/rss/ekonomi", category: "ekonomi" },
  { id: "milliyet-ekonomi", label: "Milliyet Ekonomi", url: "https://www.milliyet.com.tr/rss/rssnews/ekonomi.xml", category: "ekonomi" },
  { id: "ntv-ekonomi", label: "NTV Ekonomi", url: "https://www.ntv.com.tr/ekonomi/rss", category: "ekonomi" },
  { id: "cnnturk-ekonomi", label: "CNN Türk Ekonomi", url: "https://www.cnnturk.com/feed/rss/ekonomi/news", category: "ekonomi" },
  { id: "dunya-gazetesi", label: "Dünya Gazetesi", url: "https://www.dunya.com/rss/ekonomi.xml", category: "ekonomi" },
  { id: "ekonomi-gazetesi", label: "Ekonomi Gazetesi", url: "https://www.ekonomigazetesi.com.tr/rss/guncel.xml", category: "ekonomi" },
  { id: "aa-ekonomi", label: "Anadolu Ajansı", url: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi", category: "ekonomi" },
  { id: "sozcu-ekonomi", label: "Sözcü Ekonomi", url: "https://www.sozcu.com.tr/rss/ekonomi.xml", category: "ekonomi" },
  { id: "para-dergisi", label: "Para Dergisi", url: "https://www.paradergi.com.tr/rss/gundem.xml", category: "finans" },
  { id: "reuters-economy", label: "Reuters Economy", url: "https://feeds.reuters.com/reuters/businessNews", category: "finans" },
  { id: "ft-economy", label: "Financial Times", url: "https://www.ft.com/rss/home/turkish", category: "finans" },
] as const;

// ─── RSS Ayrıştırıcı ──────────────────────────────────────────────────────────
const stripHtml = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&uuml;/g, "ü")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&ouml;/g, "ö")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&ccedil;/g, "ç")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&scedil;/g, "ş")
    .replace(/&Scedil;/g, "Ş")
    .replace(/&idot;/g, "İ")
    .trim();

const extractTagContent = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : undefined;
};

const parseRssItems = (xml: string, source: NewsFeedSource): NewsItem[] => {
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  const matches = [...xml.matchAll(itemPattern)];
  const items: NewsItem[] = [];

  for (const match of matches.slice(0, NEWS_ITEMS_PER_SOURCE)) {
    const itemXml = match[1];
    const title = extractTagContent(itemXml, "title");
    const link =
      extractTagContent(itemXml, "link") ??
      itemXml.match(/<link\s*\/?>([^<]*)/i)?.[1]?.trim();
    const pubDate = extractTagContent(itemXml, "pubDate");
    const description = extractTagContent(itemXml, "description");

    if (!title || !link) continue;

    let publishedAt: string;
    try {
      publishedAt = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString();
    } catch {
      publishedAt = new Date().toISOString();
    }

    const shortId = Buffer.from(link).toString("base64url").slice(0, 10);

    items.push({
      id: `${source.id}-${shortId}`,
      sourceId: source.id,
      sourceLabel: source.label,
      title: title.slice(0, 200),
      description: description ? description.slice(0, 300) : undefined,
      link,
      publishedAt,
    });
  }

  return items;
};

// ─── Tek Kaynaktan Veri Çek ───────────────────────────────────────────────────
const fetchSourceItems = async (source: NewsFeedSource): Promise<NewsItem[]> => {
  const response = await fetch(source.url, {
    next: { revalidate: NEWS_FEED_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(8_000),
    headers: { "User-Agent": "MakroVeriMasasi/1.0 RSS Reader" },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const xml = await response.text();
  return parseRssItems(xml, source);
};

// ─── Tüm Kaynaklardan Haber Akışı ────────────────────────────────────────────
export const getNewsFeed = async (): Promise<NewsFeed> => {
  const results = await Promise.allSettled(
    NEWS_FEED_SOURCES.map((source) => fetchSourceItems(source)),
  );

  const allItems: NewsItem[] = [];
  const sourceStatuses = results.map((result, index) => {
    const source = NEWS_FEED_SOURCES[index];
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
      return { id: source.id, label: source.label, ok: true, itemCount: result.value.length };
    }
    return { id: source.id, label: source.label, ok: false, itemCount: 0 };
  });

  // Tarihe göre sırala (en yeni önce)
  allItems.sort((left, right) => {
    const leftTime = new Date(left.publishedAt).getTime();
    const rightTime = new Date(right.publishedAt).getTime();
    return rightTime - leftTime;
  });

  return {
    items: allItems.slice(0, 50),
    sources: sourceStatuses,
    fetchedAt: new Date().toISOString(),
  };
};
