import { NEWS_FEED_SOURCES } from "@/lib/get-news-feed";

export interface AtlasianForecast {
  key: string;
  label: string;
  value: number | null;
  trend: "up" | "down" | "stable";
  confidence: "high" | "medium" | "low";
  rationale: string;
  generatedAt: string;
}

export interface AtlasianArticle {
  id: string;
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string;
  title: string;
  description?: string;
  link?: string;
  publishedAt?: string;
}

export interface AtlasianSourceStatus {
  id: string;
  label: string;
  url: string;
  ok: boolean;
  itemCount: number;
}

export interface AtlasianMindMapSectionItem {
  id: string;
  label: string;
  description?: string;
  href?: string;
}

export interface AtlasianMindMapSection {
  id: string;
  title: string;
  items: AtlasianMindMapSectionItem[];
}

export interface AtlasianMindMap {
  title: string;
  centralLabel: string;
  centralSummary: string;
  sections: AtlasianMindMapSection[];
}

export interface AtlasianSynthesis {
  forecasts: AtlasianForecast[];
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  keyThemes: string[];
  generatedAt: string;
  newsItemCount: number;
  sourceStatuses: AtlasianSourceStatus[];
  articles: AtlasianArticle[];
  mindMap: AtlasianMindMap;
  contextDocumentPath: string;
  error?: string;
}

const ATLASIAN_SOURCE_IDS = [
  "wsj-markets",
  "cnbc-economy",
  "yahoo-finance",
  "investing-tr",
  "coindesk",
] as const;
const ATLASIAN_ARTICLES_PER_SOURCE = 6;
const ATLASIAN_MIND_MAP_ARTICLE_COUNT = 8;
const ATLASIAN_CONTEXT_DOCUMENT_PATH = "apps/makro/ATLASIAN_CONTEXT.md";

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
    .trim();

const extractTagContent = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : undefined;
};

const toIsoDate = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString();
};

const parseAtlasianArticles = (
  xml: string,
  source: (typeof NEWS_FEED_SOURCES)[number],
) => {
  const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];

  return matches.slice(0, ATLASIAN_ARTICLES_PER_SOURCE).flatMap((match, index) => {
    const itemXml = match[1];
    const title = extractTagContent(itemXml, "title");
    const description = extractTagContent(itemXml, "description");
    const link =
      extractTagContent(itemXml, "link") ??
      itemXml.match(/<link\s*\/?>([^<]*)/i)?.[1]?.trim();
    const publishedAt = toIsoDate(extractTagContent(itemXml, "pubDate"));

    if (!title) {
      return [];
    }

    return [
      {
        id: `${source.id}-${index}`,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        title: title.slice(0, 200),
        description: description ? description.slice(0, 260) : undefined,
        link,
        publishedAt,
      } satisfies AtlasianArticle,
    ];
  });
};

const buildPromptText = (articles: AtlasianArticle[]) => {
  const groupedArticles = new Map<string, AtlasianArticle[]>();

  for (const article of articles) {
    const currentArticles = groupedArticles.get(article.sourceLabel) ?? [];
    currentArticles.push(article);
    groupedArticles.set(article.sourceLabel, currentArticles);
  }

  return [...groupedArticles.entries()]
    .map(([sourceLabel, sourceArticles]) => {
      const sourceLines = sourceArticles.map((article) => {
        const articleLine = article.description
          ? `- ${article.title}: ${article.description}`
          : `- ${article.title}`;

        return articleLine;
      });

      return `### ${sourceLabel}\n${sourceLines.join("\n")}`;
    })
    .join("\n\n");
};

const buildMindMap = ({
  summary,
  keyThemes,
  forecasts,
  articles,
  sourceStatuses,
}: {
  summary: string;
  keyThemes: string[];
  forecasts: AtlasianForecast[];
  articles: AtlasianArticle[];
  sourceStatuses: AtlasianSourceStatus[];
}) => ({
  title: "ATLASIAN zihin haritası",
  centralLabel: "ATLASIAN çekirdeği",
  centralSummary: summary,
  sections: [
    {
      id: "sources",
      title: "Kaynaklar",
      items: sourceStatuses.map((sourceStatus) => ({
        id: sourceStatus.id,
        label: sourceStatus.label,
        description: sourceStatus.ok
          ? `${sourceStatus.itemCount} haber kullanıldı`
          : "Kaynak bu turda okunamadı",
        href: sourceStatus.url,
      })),
    },
    {
      id: "themes",
      title: "Temalar",
      items: keyThemes.map((theme, index) => ({
        id: `theme-${index + 1}`,
        label: theme,
      })),
    },
    {
      id: "forecasts",
      title: "Tahminler",
      items: forecasts.map((forecast) => ({
        id: forecast.key,
        label:
          forecast.value === null
            ? forecast.label
            : `${forecast.label} · ${forecast.value.toFixed(2)}`,
        description: forecast.rationale,
      })),
    },
    {
      id: "articles",
      title: "Baz alınan haberler",
      items: articles.slice(0, ATLASIAN_MIND_MAP_ARTICLE_COUNT).map((article) => ({
        id: article.id,
        label: article.title,
        description: article.sourceLabel,
        href: article.link,
      })),
    },
  ],
} satisfies AtlasianMindMap);

const fetchAtlasianNews = async () => {
  const atlasianSources = NEWS_FEED_SOURCES.filter((source) =>
    ATLASIAN_SOURCE_IDS.includes(source.id as (typeof ATLASIAN_SOURCE_IDS)[number]),
  );
  const results = await Promise.allSettled(
    atlasianSources.map(async (source) => {
      const response = await fetch(source.url, {
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "MakroVeriMasasi/1.0 ATLASIAN" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return { source, xml: await response.text() };
    }),
  );

  const articles: AtlasianArticle[] = [];
  const sourceStatuses = results.map((result, index) => {
    const source = atlasianSources[index];

    if (result.status === "fulfilled") {
      const parsedArticles = parseAtlasianArticles(result.value.xml, source);
      articles.push(...parsedArticles);

      return {
        id: source.id,
        label: source.label,
        url: source.url,
        ok: true,
        itemCount: parsedArticles.length,
      } satisfies AtlasianSourceStatus;
    }

    return {
      id: source.id,
      label: source.label,
      url: source.url,
      ok: false,
      itemCount: 0,
    } satisfies AtlasianSourceStatus;
  });

  articles.sort((left, right) => {
    const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0;
    const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0;

    return rightTime - leftTime;
  });

  return {
    articles,
    sourceStatuses,
    promptText: buildPromptText(articles),
  };
};

const callClaudeApi = async (prompt: string): Promise<string> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY bulunamadı");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API hatası: ${response.status} — ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  return data.content.find((contentBlock) => contentBlock.type === "text")?.text ?? "";
};

const FORECAST_PROMPT = (newsText: string, currentDate: string) => `
Sen MAKRO isimli Türkiye odaklı makroekonomik tahmin sisteminin AI motorusun.
Bugünün tarihi: ${currentDate}

Aşağıda WSJ, CNBC, Yahoo Finance, CoinDesk ve Investing.com'dan son haber akışları var.
Bu haberleri analiz ederek Türkiye'nin aşağıdaki 6 makro göstergesi için kısa vadeli tahminler üret.

## Haberleri Analiz Et
${newsText}

## Görevler
1. Yukarıdaki küresel haberlerin Türkiye makroekonomiğine etkisini analiz et
2. Her gösterge için değer tahmini, trend ve güven seviyesi belirle
3. Kısa Türkçe gerekçe yaz (max 80 karakter her biri)

## Çıktı Formatı (sadece JSON döndür, başka bir şey yazma)
{
  "forecasts": [
    {
      "key": "yil-sonu-tufe",
      "label": "Yıl Sonu TÜFE",
      "value": <sayı, örn: 28.5>,
      "trend": "up"|"down"|"stable",
      "confidence": "high"|"medium"|"low",
      "rationale": "<80 char Türkçe gerekçe>"
    },
    {
      "key": "on-iki-ay-sonrasi-tufe",
      "label": "12 Ay Sonrası TÜFE",
      "value": <sayı>,
      "trend": "up"|"down"|"stable",
      "confidence": "high"|"medium"|"low",
      "rationale": "<80 char>"
    },
    {
      "key": "ilk-toplanti-politika-faizi",
      "label": "İlk Toplantı Politika Faizi",
      "value": <sayı>,
      "trend": "up"|"down"|"stable",
      "confidence": "high"|"medium"|"low",
      "rationale": "<80 char>"
    },
    {
      "key": "on-iki-ay-sonrasi-politika-faizi",
      "label": "12 Ay Sonrası Politika Faizi",
      "value": <sayı>,
      "trend": "up"|"down"|"stable",
      "confidence": "high"|"medium"|"low",
      "rationale": "<80 char>"
    },
    {
      "key": "yil-sonu-usd-try",
      "label": "Yıl Sonu USD/TRY",
      "value": <sayı>,
      "trend": "up"|"down"|"stable",
      "confidence": "high"|"medium"|"low",
      "rationale": "<80 char>"
    },
    {
      "key": "on-iki-ay-sonrasi-usd-try",
      "label": "12 Ay Sonrası USD/TRY",
      "value": <sayı>,
      "trend": "up"|"down"|"stable",
      "confidence": "high"|"medium"|"low",
      "rationale": "<80 char>"
    }
  ],
  "summary": "<200 char Türkçe genel sentez>",
  "sentiment": "positive"|"neutral"|"negative",
  "keyThemes": ["<tema 1>", "<tema 2>", "<tema 3>"]
}
`;

export const runAtlasianForecast = async (): Promise<AtlasianSynthesis> => {
  const generatedAt = new Date().toISOString();
  const { articles, sourceStatuses, promptText } = await fetchAtlasianNews();
  const emptyMindMap = buildMindMap({
    summary: "ATLASIAN bu turda haberleri okuyamadı.",
    keyThemes: [],
    forecasts: [],
    articles,
    sourceStatuses,
  });

  try {
    if (!promptText.trim() || promptText.length < 100) {
      return {
        forecasts: [],
        summary: "Haber verisi çekilemedi — tahmin üretilemedi.",
        sentiment: "neutral",
        keyThemes: [],
        generatedAt,
        newsItemCount: articles.length,
        sourceStatuses,
        articles,
        mindMap: emptyMindMap,
        contextDocumentPath: ATLASIAN_CONTEXT_DOCUMENT_PATH,
        error: "Yeterli haber verisi alınamadı",
      };
    }

    const rawResponse = await callClaudeApi(
      FORECAST_PROMPT(promptText, new Date().toLocaleDateString("tr-TR")),
    );
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Claude yanıtında JSON bulunamadı");
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      forecasts: Array<{
        key: string;
        label: string;
        value: number | null;
        trend: "up" | "down" | "stable";
        confidence: "high" | "medium" | "low";
        rationale: string;
      }>;
      summary: string;
      sentiment: "positive" | "neutral" | "negative";
      keyThemes: string[];
    };

    const forecasts: AtlasianForecast[] = parsed.forecasts.map((forecast) => ({
      ...forecast,
      generatedAt,
    }));

    return {
      forecasts,
      summary: parsed.summary,
      sentiment: parsed.sentiment,
      keyThemes: parsed.keyThemes ?? [],
      generatedAt,
      newsItemCount: articles.length,
      sourceStatuses,
      articles,
      mindMap: buildMindMap({
        summary: parsed.summary,
        keyThemes: parsed.keyThemes ?? [],
        forecasts,
        articles,
        sourceStatuses,
      }),
      contextDocumentPath: ATLASIAN_CONTEXT_DOCUMENT_PATH,
    };
  } catch (error) {
    return {
      forecasts: [],
      summary: "Analiz sırasında hata oluştu.",
      sentiment: "neutral",
      keyThemes: [],
      generatedAt,
      newsItemCount: articles.length,
      sourceStatuses,
      articles,
      mindMap: emptyMindMap,
      contextDocumentPath: ATLASIAN_CONTEXT_DOCUMENT_PATH,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
