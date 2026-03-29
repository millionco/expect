import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { HOME_SOURCE_PREVIEW_COUNT } from "@/lib/constants";
import { getMakroData } from "@/lib/get-makro-data";

const metrics = [
  {
    key: "countries",
    label: "Countries",
    description: "Seeded country definitions",
  },
  {
    key: "sources",
    label: "Sources",
    description: "Official and validation feeds",
  },
  {
    key: "indicators",
    label: "Indicators",
    description: "Primary macroeconomic series",
  },
  {
    key: "indicatorComponents",
    label: "Components",
    description: "Breakdowns for deeper reads",
  },
] as const;

export default async function HomePage() {
  const makroData = await getMakroData();
  const isDatabaseBacked = makroData.dataSource === "database";
  const sourceBadgeLabel = isDatabaseBacked ? "Database-backed application" : "Seed fallback mode";
  const sourceBadgeDescription = isDatabaseBacked
    ? `Live PostgreSQL reads from ${makroData.databaseTarget}`
    : `Falling back to ${makroData.filePath}`;
  const headline = isDatabaseBacked
    ? "Makro artik canli PostgreSQL verisini uygulama icinde gezilebilir bir veri sozlugune donusturuyor."
    : "Makro uygulamasi seed SQL fallback ile calisiyor; canli veritabani tekrar baglandiginda otomatik gecis yapacak.";
  const description = isDatabaseBacked
    ? "Arayuz, kategorileri, kaynaklari, indikatorleri ve bilesenleri dogrudan veritabanindan okuyup urun yuzeyine tasiyor."
    : "Arayuz dusmuyor; seed SQL icerigini okuyup kategori, kaynak, bilesen ve indikator katmanlarini ayni yuzeyde koruyor.";

  return (
    <MakroShell
      eyebrow="Makro Workspace"
      title="Türkiye makro verisini uygulama içinde keşfedilebilir bir veri sözlüğüne dönüştür."
      description="Makro, aynı veri modelini hem canlı PostgreSQL hem de seed fallback üzerinden okunur bir ürün yüzeyine dönüştürüyor."
    >
      <section className="grid gap-8 rounded-[2rem] border border-border/70 bg-panel/90 p-8 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur md:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 font-medium text-accent">
              {sourceBadgeLabel}
            </span>
            <span className="rounded-full border border-border bg-card px-3 py-1 text-muted-foreground">
              {sourceBadgeDescription}
            </span>
            {makroData.fallbackReason && (
              <span className="rounded-full border border-border bg-background px-3 py-1 text-muted-foreground">
                fallback active
              </span>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
              {headline}
            </h2>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/indicators"
              className="rounded-full border border-accent/20 bg-accent px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Indicators
            </Link>
            <Link
              href="/categories"
              className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Categories
            </Link>
            <Link
              href="/sources"
              className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Sources
            </Link>
            <Link
              href="/components"
              className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Components
            </Link>
            <Link
              href="/setup"
              className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Setup status
            </Link>
            <Link
              href="/exports"
              className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Exports
            </Link>
          </div>
        </div>

        <div className="grid gap-4 rounded-3xl border border-border bg-card/80 p-5">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Runtime source
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {isDatabaseBacked ? makroData.databaseTarget : makroData.filePath}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background px-3 py-2 text-right">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                indicators
              </p>
              <p className="text-2xl font-semibold">{makroData.counts.indicators}</p>
            </div>
          </div>

          <div className="grid gap-3">
            {makroData.sources.slice(0, HOME_SOURCE_PREVIEW_COUNT).map((source) => (
              <div
                key={source.sourceCode}
                className="flex items-center justify-between rounded-2xl border border-border/80 bg-background/85 px-4 py-3"
              >
                <span className="font-mono text-sm text-foreground">{source.sourceCode}</span>
                <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {source.reliabilityScore}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <article
            key={metric.key}
            className="rounded-3xl border border-border bg-card/85 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]"
          >
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              {metric.label}
            </p>
            <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground">
              {makroData.counts[metric.key]}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{metric.description}</p>
          </article>
        ))}
        <article className="rounded-3xl border border-border bg-card/85 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Primary sources
          </p>
          <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground">
            {makroData.counts.primarySources}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Resmi veri omurgasını taşıyan ana sağlayıcılar
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Explorer depth
          </p>
          <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground">
            {makroData.counts.indicatorComponents}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Component explorer ile alt kirilimlar artik ayri bir yuzeye sahip
          </p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="rounded-[2rem] border border-border bg-card/85 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Categories
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                Veri yapısının omurgası
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {makroData.categories.map((category) => (
              <article
                key={category.category}
                className="rounded-3xl border border-border bg-background/90 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">{category.label}</h3>
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                    {category.indicatorCount} indicators
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {category.highlightedIndicators.map((indicator) => (
                    <Link
                      key={indicator.indicatorCode}
                      href={`/indicators/${indicator.indicatorCode}`}
                      className="rounded-full border border-border bg-card px-3 py-2 font-mono text-xs text-foreground transition-colors hover:border-accent/30 hover:text-accent"
                    >
                      {indicator.indicatorCode}
                    </Link>
                  ))}
                  <Link
                    href={`/categories/${category.category}`}
                    className="rounded-full border border-border bg-card px-3 py-2 font-mono text-xs text-foreground transition-colors hover:border-accent/30 hover:text-accent"
                  >
                    view category
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-border bg-card/85 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              SQL preview
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                {isDatabaseBacked ? "Live database with seed visibility" : "Seed fallback preview"}
              </h2>
            </div>
            <span className="rounded-full border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
              {makroData.filePath}
            </span>
          </div>

          {makroData.fallbackReason && (
            <p className="mt-6 rounded-3xl border border-border bg-background/90 px-4 py-3 text-sm leading-6 text-muted-foreground">
              Database fallback reason: {makroData.fallbackReason}
            </p>
          )}

          <pre className="mt-6 overflow-x-auto rounded-3xl border border-border bg-ink px-5 py-4 font-mono text-[13px] leading-6 text-ink-foreground">
            <code>{makroData.sqlPreview}</code>
          </pre>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-border bg-card/85 p-6">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Featured indicators
          </p>
          <div className="mt-5 grid gap-4">
            {makroData.indicators.slice(0, 6).map((indicator) => (
              <Link
                key={indicator.indicatorCode}
                href={`/indicators/${indicator.indicatorCode}`}
                className="rounded-3xl border border-border bg-background/90 p-5 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    {indicator.indicatorCode}
                  </span>
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                    {indicator.categoryLabel}
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                  {indicator.indicatorName}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {indicator.descriptionShort}
                </p>
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-border bg-card/85 p-6">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Honest status
          </p>
          <div className="mt-5 grid gap-4">
            <div className="rounded-3xl border border-border bg-background/90 p-5">
              <h3 className="text-xl font-semibold tracking-[-0.03em]">Çalışan kısım</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Uygulama katmanı, canlı PostgreSQL okuması, seed fallback, çok sayfalı keşif akışı ve
                JSON API birlikte çalışıyor.
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-background/90 p-5">
              <h3 className="text-xl font-semibold tracking-[-0.03em]">
                Henüz dış araç isteyen kısım
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Sonraki ürün adımı zaman serisi ingestion, gerçek güncel veri çekimi ve tercihe göre
                Supabase auth veya yönetim akışı eklemek.
              </p>
            </div>
            <Link
              href="/setup"
              className="inline-flex w-fit rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Setup durumuna git
            </Link>
            <Link
              href="/exports"
              className="inline-flex w-fit rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Export ekranina git
            </Link>
          </div>
        </article>
      </section>
    </MakroShell>
  );
}
