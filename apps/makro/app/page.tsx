"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MakroShell } from "@/components/makro-shell";
import { useDrawer } from "@/components/dashboard-drawer";
import { getFrequencyLabel } from "@/lib/format-indicator-labels";
import { getDifferenceToneClassName, getForecastComparisonRows } from "@/lib/get-forecast-comparison-rows";

// ─── Types (mirroring server shapes) ─────────────────────────────────────────
interface ExchangeQuote { code: string; name: string; forexSelling: number }
interface CalendarRelease { key: string; title: string; releaseAt: string }
interface ForecastSeries { key: string; label: string; status: string; latest?: { value: number; date: string } }
interface InternalEntry { key: string; value?: number; note: string; detailHref: string }
interface IndicatorComponent { componentCode: string; componentName: string; description: string; sortOrder: number }
interface Indicator {
  indicatorCode: string; indicatorName: string; category: string; categoryLabel: string;
  frequency: string; unit: string; descriptionShort: string; components: IndicatorComponent[];
}
interface NewsItem { id: string; sourceId: string; sourceLabel: string; title: string; description?: string; link: string; publishedAt: string }

interface DashboardData {
  dataMode: string;
  dataTarget: string;
  kurDate: string;
  quotes: ExchangeQuote[];
  calendarReleases: CalendarRelease[];
  forecastSeries: ForecastSeries[];
  internalEntries: InternalEntry[];
  indicators: Indicator[];
  newsItems: NewsItem[];
  newsSources: { ok: number; total: number };
  limitations: string[];
  fetchedAt: string;
}

// ─── Data fetcher (client-side parallel fetch) ────────────────────────────────
const fetchDashboardData = async (): Promise<DashboardData> => {
  const [makroRes, liveRes, internalRes, newsRes] = await Promise.all([
    fetch("/api/indicators?limit=50", { cache: "no-store" }),
    fetch("/api/live", { cache: "no-store" }),
    fetch("/api/internal-forecasts", { cache: "no-store" }),
    fetch("/api/news", { cache: "no-store" }),
  ]);

  const [indicators, liveData, internal, news] = await Promise.all([
    makroRes.ok ? makroRes.json() : { indicators: [] },
    liveRes.ok ? liveRes.json() : {},
    internalRes.ok ? internalRes.json() : { entries: [] },
    newsRes.ok ? newsRes.json() : { items: [], sources: [] },
  ]) as [
    { indicators: Indicator[] },
    {
      exchangeSnapshot?: { date: string; quotes: ExchangeQuote[] };
      calendarReleases?: CalendarRelease[];
      limitations?: string[];
      evdsForecastFeed?: { series: ForecastSeries[] };
    },
    { entries: InternalEntry[]; updatedAt?: string; missing?: boolean },
    { items: NewsItem[]; sources: Array<{ ok: boolean }>; fetchedAt: string }
  ];

  return {
    dataMode: "Seed modu",
    dataTarget: "",
    kurDate: liveData?.exchangeSnapshot?.date ?? "—",
    quotes: liveData?.exchangeSnapshot?.quotes ?? [],
    calendarReleases: liveData?.calendarReleases ?? [],
    forecastSeries: liveData?.evdsForecastFeed?.series ?? [],
    internalEntries: internal?.entries ?? [],
    indicators: indicators?.indicators ?? [],
    newsItems: news?.items ?? [],
    newsSources: {
      ok: news?.sources?.filter((s) => s.ok).length ?? 0,
      total: news?.sources?.length ?? 0,
    },
    limitations: liveData?.limitations ?? [],
    fetchedAt: news?.fetchedAt ?? new Date().toISOString(),
  };
};

const formatRelativeTime = (isoDate: string) => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  if (m < 1) return "Az önce";
  if (m < 60) return `${m} dk`;
  if (h < 24) return `${h} sa`;
  return new Date(isoDate).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
};

// ─── Page Component ───────────────────────────────────────────────────────────
export default function HomePage() {
  const { open } = useDrawer();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData().then(setData).finally(() => setLoading(false));
  }, []);

  // Forecasts
  const comparisonRows =
    data
      ? getForecastComparisonRows(
          data.forecastSeries as Parameters<typeof getForecastComparisonRows>[0],
          data.internalEntries as Parameters<typeof getForecastComparisonRows>[1],
        )
      : [];

  const usd = data?.quotes.find((q) => q.code === "USD");
  const eur = data?.quotes.find((q) => q.code === "EUR");
  const gbp = data?.quotes.find((q) => q.code === "GBP");
  const internalReady = data?.internalEntries.filter((e) => e.value !== undefined).length ?? 0;
  const internalTotal = data?.internalEntries.length ?? 0;

  // Featured indicators: 2 per category, first 6
  const featuredIndicators = data
    ? Object.values(
        data.indicators.reduce<Record<string, Indicator[]>>((acc, ind) => {
          acc[ind.category] = [...(acc[ind.category] ?? []), ind];
          return acc;
        }, {}),
      )
        .flatMap((group) => group.slice(0, 2))
        .slice(0, 6)
    : [];

  return (
    <MakroShell
      eyebrow="Ana ekran"
      title="Güncel veri ve piyasa beklentileri"
      description="TCMB kur akışı, EVDS tahminler, ATLASIAN haber ağı ve AI analizi tek panelde."
    >
      {/* ─── Stat Kartları ────────────────────────────────────────────── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {/* Kur tarihi */}
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Kur tarihi</p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
            {loading ? "—" : data?.kurDate ?? "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">TCMB canlı akışı</p>
        </article>

        {/* Resmi tahmin */}
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Resmi tahmin</p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
            {loading ? "—" : `${comparisonRows.length}/${data?.forecastSeries.length ?? 0}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">EVDS3 hazır seri</p>
        </article>

        {/* İç tahmin */}
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">İç tahmin</p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
            {loading ? "—" : `${internalReady}/${internalTotal}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Yerel tahmin girişi</p>
        </article>

        {/* Haber ağı */}
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Haber ağı</p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
            {loading ? "—" : `${data?.newsSources.ok ?? 0}/${data?.newsSources.total ?? 0}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{loading ? "—" : `${data?.newsItems.length ?? 0} haber`}</p>
        </article>
      </section>

      {/* ─── Ana İçerik ────────────────────────────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_20rem]">
        {/* Piyasa Beklentileri */}
        <article className="makro-surface rounded-[1.5rem] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Piyasa beklentileri</p>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
                Resmi beklenti ve bizim tahminimiz
              </h2>
            </div>
            <Link href="/forecasts" className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/30 hover:text-accent">
              Tüm tahminler
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[50rem] border-separate border-spacing-y-1.5">
              <thead>
                <tr className="text-left">
                  {["Gösterge", "Resmi", "Bizim", "Fark", "→"].map((h) => (
                    <th key={h} className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="px-3 py-4 text-sm text-muted-foreground">Yükleniyor…</td></tr>
                )}
                {!loading && comparisonRows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-4 text-sm text-muted-foreground">EVDS3 verisi bekleniyor.</td></tr>
                )}
                {comparisonRows.map((row) => (
                  <tr key={row.key} className="rounded-xl border border-border bg-background/80 text-sm">
                    <td className="rounded-l-xl px-3 py-2.5 align-top">
                      <p className="font-medium text-foreground">{row.title}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{row.officialDate}</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm font-semibold tabular-nums text-foreground">{row.officialValue}</td>
                    <td className="px-3 py-2.5 font-mono text-sm font-semibold tabular-nums text-foreground">{row.internalValue}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${getDifferenceToneClassName(row.difference)}`}>
                        {row.difference}
                      </span>
                    </td>
                    <td className="rounded-r-xl px-3 py-2.5">
                      <Link href={row.detailHref} className="inline-flex rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] font-medium text-accent hover:border-accent/35">
                        {row.detailLabel}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {/* Sağ kolon — sadece kurlar + ATLASIAN + takvim */}
        <div className="grid gap-3">
          {/* Canlı Kurlar */}
          <article className="makro-surface rounded-[1.5rem] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Canlı kur</p>
              <Link href="/live" className="text-[10px] text-accent hover:underline">Detay →</Link>
            </div>
            <div className="mt-3 grid gap-1.5">
              {[{ label: "USD/TRY", q: usd }, { label: "EUR/TRY", q: eur }, { label: "GBP/TRY", q: gbp }].map(({ label, q }) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-border bg-background/80 px-3 py-2">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-accent">
                    {loading ? "—" : q ? q.forexSelling.toFixed(4) : "Yok"}
                  </span>
                </div>
              ))}
            </div>
          </article>

          {/* ATLASIAN AI Butonu */}
          <button
            onClick={() => open({ type: "atlasian" })}
            className="makro-interactive makro-surface rounded-[1.5rem] p-4 text-left hover:border-accent/30"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">ATLASIAN</p>
              <span className="rounded-full border border-accent/24 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">AI</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">Küresel Haber Analizi</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              WSJ · CNBC · Yahoo Finance · CoinDesk · Investing.com — Claude AI sentezi
            </p>
          </button>

          {/* Ajan Durumu Butonu */}
          <button
            onClick={() => open({ type: "agents" })}
            className="makro-interactive makro-surface rounded-[1.5rem] p-4 text-left hover:border-accent/30"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Ajan Durumu</p>
            <p className="mt-2 text-sm font-semibold text-foreground">Kaynak &amp; Sistem İzleme</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              TCMB · EVDS · Haber kaynakları · Veritabanı
            </p>
          </button>

          {/* Sıradaki Yayın */}
          <article className="makro-surface rounded-[1.5rem] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Sıradaki yayın</p>
            {loading ? (
              <p className="mt-2 text-sm text-muted-foreground">Yükleniyor…</p>
            ) : (
              <>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {data?.calendarReleases[0]?.title ?? "Yaklaşan yayın yok"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data?.calendarReleases[0]?.releaseAt ?? "—"}
                </p>
              </>
            )}
          </article>
        </div>
      </section>

      {/* ─── Haber Ağı ─────────────────────────────────────────────────── */}
      <section className="makro-surface rounded-[1.5rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Haber ağı</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
              Son ekonomi haberleri
            </h2>
          </div>
          <Link href="/haber-agi" className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/30 hover:text-accent">
            Tüm haberler
          </Link>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {loading && Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-border bg-background/60 px-4 py-3 h-20" />
          ))}
          {!loading && data?.newsItems.slice(0, 8).map((item) => (
            <button
              key={item.id}
              onClick={() => open({
                type: "news",
                title: item.title,
                source: item.sourceLabel,
                description: item.description,
                link: item.link,
                publishedAt: item.publishedAt,
              })}
              className="makro-interactive group rounded-2xl border border-border bg-background/80 px-4 py-3 text-left hover:border-accent/30"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-medium text-muted-foreground">{item.sourceLabel}</span>
                <span className="flex-shrink-0 text-[10px] text-muted-foreground/50">{formatRelativeTime(item.publishedAt)}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-4 text-foreground group-hover:text-accent">
                {item.title}
              </p>
            </button>
          ))}
          {!loading && (data?.newsItems.length ?? 0) === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">Haber kaynakları şu an erişilemiyor.</p>
          )}
        </div>
      </section>

      {/* ─── Öne Çıkan Göstergeler ─────────────────────────────────────── */}
      <section className="makro-surface rounded-[1.5rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Göstergeler</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">Öne çıkan seriler</h2>
          </div>
          <Link href="/indicators" className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/30 hover:text-accent">
            Tüm göstergeler
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-1.5">
            <thead>
              <tr className="text-left">
                {["Kod", "Gösterge", "Kategori", "Sıklık", "Alt Bileşenler"].map((h) => (
                  <th key={h} className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-3 py-4 text-sm text-muted-foreground">Yükleniyor…</td></tr>
              )}
              {!loading && featuredIndicators.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-sm text-muted-foreground">Gösterge verisi bekleniyor.</td></tr>
              )}
              {featuredIndicators.map((ind) => (
                <tr
                  key={ind.indicatorCode}
                  onClick={() => open({
                    type: "indicator",
                    code: ind.indicatorCode,
                    name: ind.indicatorName,
                    category: ind.categoryLabel,
                    frequency: getFrequencyLabel(ind.frequency),
                    description: ind.descriptionShort,
                    components: ind.components.map((c) => ({
                      code: c.componentCode,
                      name: c.componentName,
                      description: c.description,
                    })),
                  })}
                  className="makro-interactive cursor-pointer rounded-xl border border-border bg-background/80 text-sm hover:border-accent/30"
                >
                  <td className="rounded-l-xl px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {ind.indicatorCode}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{ind.indicatorName}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{ind.categoryLabel}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{getFrequencyLabel(ind.frequency)}</td>
                  <td className="rounded-r-xl px-3 py-2.5">
                    <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] font-medium text-accent">
                      {ind.components.length} bileşen →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Yayın Akışı ───────────────────────────────────────────────── */}
      <section className="makro-surface rounded-[1.5rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Yayın akışı</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">Yaklaşan EVDS yayınları</h2>
          </div>
          <Link href="/live" className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/30 hover:text-accent">
            Canlı veri
          </Link>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {loading && Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-border bg-background/60 h-16" />
          ))}
          {!loading && (data?.calendarReleases ?? []).slice(0, 4).map((release) => (
            <Link
              key={release.key}
              href="/live"
              className="makro-interactive rounded-2xl border border-border bg-background/80 p-3 hover:border-accent/30"
            >
              <p className="text-sm font-medium text-foreground">{release.title}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{release.releaseAt}</p>
            </Link>
          ))}
          {!loading && (data?.calendarReleases.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Takvim verisi bekleniyor.</p>
          )}
        </div>
      </section>
    </MakroShell>
  );
}
