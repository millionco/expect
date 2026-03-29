export const RSS_SOURCES = [
    {
        name: "Wall Street Journal (WSJ) - Piyasalar",
        url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    },
    {
        name: "CNBC - Ekonomi Haberleri",
        url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664",
    },
    {
        name: "CoinDesk - Küresel Kripto ve Stablecoin Akışı",
        url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    },
    {
        name: "Yahoo Finance - Dünya ve Emtia",
        url: "https://finance.yahoo.com/news/rssindex",
    },
    {
        name: "Investing Türkiye - Finans Akışı",
        url: "https://tr.investing.com/rss/news_25.rss",
    }
];

export const LLM_PROMPT = `Sen ATLASIAN isimli çok yetenekli bir "Derin Ekonomi / Finans Sentez" botusun.
Aşağıda dünyanın kilit haber ajanslarından (WSJ, CNBC, vb.) son saatlerde düşmüş en güncel başlıklar ve haber metinleri bulunuyor (RSS Feed'lerinden çekildi).

Senin görevin:
1. Bu yabancı kaynaklı haberleri oku ve Türkiye piyasaları dahil olmak üzere küresel ekonomik etkilerini analiz et.
2. Bu haberi daha önceki 'Küresel Yatırım Yönelimi' raporlarımıza uygun (Altın 🔼 , Petrol 🔽, Enflasyon ve Jeopolitik Riskler) kıstaslarına göre sentezle.
3. Bana V3 (Üçüncü Jenerasyon) Küresel Haber & Yabancı Kaynak Sentezi adlı şık, Markdown formatında bir rapor hazırla.
4. Özellikle "Stablecoin kullanımı ve Kripto Varlıkların (Dedolarizasyon)" geleneksel para birimlerini nasıl sarsabileceğine dair verileri mutlaka rapora ekle.

Her önemli çıkarımda trend sembolleri (🔼, 🔽, ↔️) kullanmayı unutma!

İşte Anlık Ham Haber Verisi:
{{NEWS_DATA}}
`;
