import { MakroShell } from "@/components/makro-shell";
import { getEvdsForecastFeed } from "@/lib/get-evds-forecast-feed";
import { getInternalForecastFeed } from "@/lib/get-internal-forecast-feed";
import { getLiveDashboardFeed } from "@/lib/get-live-dashboard-feed";
import { getMakroData } from "@/lib/get-makro-data";

export default async function SetupPage() {
  const [makroData, liveDashboardFeed, evdsForecastFeed, internalForecastFeed] = await Promise.all([
    getMakroData(),
    getLiveDashboardFeed(),
    getEvdsForecastFeed(),
    getInternalForecastFeed(),
  ]);
  const setupItems = [
    {
      title: "Çalışan uygulama",
      status: "done",
      description: "Next.js app kuruldu, build aliyor ve tarayicida aciliyor.",
    },
    {
      title: "Seed entegrasyonu",
      status: "done",
      description: "supabase/seed.sql hala repo icinde ve fallback veri kaynagi olarak korunuyor.",
    },
    {
      title: "PostgreSQL şeması",
      status: "done",
      description: "schema.sql ve docker-compose.yml eklendi; veri tabani zemini repo icinde hazir.",
    },
    {
      title: "Canlı veri kaynağı",
      status: makroData.dataSource === "database" ? "done" : "blocked",
      description:
        makroData.dataSource === "database"
          ? `Uygulama su an veriyi dogrudan ${makroData.databaseTarget} uzerindeki PostgreSQL instance'inden okuyor.`
          : `Veritabani erisilemedigi icin uygulama seed fallback ile calisiyor. Neden: ${makroData.fallbackReason ?? "unknown"}`,
    },
    {
      title: "TCMB canlı feed",
      status: liveDashboardFeed.exchangeSnapshot ? "done" : "blocked",
      description: liveDashboardFeed.exchangeSnapshot
        ? `Günlük kur akışı ${liveDashboardFeed.exchangeSnapshot.date} tarihli bültenle geliyor.`
        : "TCMB günlük kur XML akışı bu ortamda çekilemedi.",
    },
    {
      title: "EVDS3 sayısal tahmin akışı",
      status: evdsForecastFeed.configuredSeriesCount > 0 ? "done" : "blocked",
      description:
        evdsForecastFeed.configuredSeriesCount > 0
          ? `${evdsForecastFeed.configuredSeriesCount} EVDS serisi okunabilir durumda. Veri artık resmi EVDS3 JSON endpoint'inden geliyor.`
          : "EVDS3 sayısal tahmin akışı bu ortamda doğrulanamadı.",
    },
    {
      title: "İç tahmin katmanı",
      status: "done",
      description: `${internalForecastFeed.entries.length} yerel tahmin satırı ${internalForecastFeed.filePath} içinden okunuyor. Boş değerler dashboard'da Girilmedi olarak görünür.`,
    },
    {
      title: "Seri kodu eşlemesi",
      status: "done",
      description:
        "PKA uygun ortalamalar ekranından resmi seri kodları otomatik doğrulandı. Varsayılan eşleşmeler uygulama içine işlendi.",
    },
    {
      title: "Export yüzeyi",
      status: "done",
      description: "CSV ve JSON cikislari eklendi; veri artik dis sistemlere tasinabilir.",
    },
    {
      title: "Component explorer",
      status: "done",
      description: "52 alt bilesen artik bagimsiz sayfa, API ve CSV export uzerinden incelenebiliyor.",
    },
    {
      title: "Global search",
      status: "done",
      description: "Kategori, indikator, component, source ve country katmanlari tek arama yuzeyinde birlesti.",
    },
    {
      title: "Quality reporting",
      status: "done",
      description: "Seed butunlugu duplicate, coverage ve dagilim kontrolleriyle gorunur hale geldi.",
    },
    {
      title: "Taxonomy explorer",
      status: "done",
      description: "Frequency, unit, value type ve seasonal adjustment dagilimlari ayri yuzey kazandi.",
    },
  ] as const;

  return (
    <MakroShell
      eyebrow="Kurulum Durumu"
      title="Kurulumun ne kadarının gerçekten tamamlandığını şeffaf biçimde göster."
      description="Bu sayfa, çalışan parçaları ve hâlâ dış bağımlılık isteyen kısımları dürüstçe ayırıyor."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Çalışma kaynağı
          </p>
          <p className="mt-3 text-sm leading-6 text-foreground">
            {makroData.dataSource === "database" ? makroData.databaseTarget : makroData.filePath}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Ülke sayısı
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.countries}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Kaynak sayısı
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.sources}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Gösterge sayısı
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.indicators}
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {setupItems.map((item) => (
          <article
            key={item.title}
            className="rounded-[2rem] border border-border bg-card/85 p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">{item.title}</h2>
              {item.status === "done" && (
                <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent">
                  tamam
                </span>
              )}
              {item.status === "blocked" && (
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                  ortam tarafından engelli
                </span>
              )}
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-border bg-card/85 p-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Komut akışı
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Veritabanını başlat
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>npm run db:up</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Seed doğrula
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>npm run db:verify</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              SQL kabuğunu aç
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>npm run db:shell</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Sağlık endpoint&apos;i
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/health</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Canlı akış
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/live</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              EVDS seri değişkenleri
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>EVDS_YEAR_END_CPI_EXPECTATION_SERIES=TP.PKAUO.S01.D.U\nEVDS_12M_CPI_EXPECTATION_SERIES=TP.PKAUO.S01.E.U\nEVDS_POLICY_RATE_EXPECTATION_SERIES=TP.PKAUO.S04.C.U\nEVDS_12M_POLICY_RATE_EXPECTATION_SERIES=TP.PKAUO.S04.D.U\nEVDS_USDTRY_EXPECTATION_SERIES=TP.PKAUO.S05.B.U\nEVDS_12M_USDTRY_EXPECTATION_SERIES=TP.PKAUO.S05.C.U</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              API referansı
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/reference</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Filtreli göstergeler
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/indicators?q=faiz&amp;category=monetary</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              CSV dışa aktar
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/exports/indicators.csv</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Bileşen API
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/components?indicatorCode=POLICY_RATE</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Genel arama
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/search?q=faiz</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Kalite raporu
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/quality</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Taxonomy
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/taxonomy</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Seed self-check
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>npm run verify:seed</code>
            </pre>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-border bg-card/85 p-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Next recommended step
        </p>
        <p className="mt-4 max-w-4xl text-base leading-7 text-muted-foreground">
          Buradan sonraki en mantikli urun adimi, ayni PostgreSQL baglantisini zaman serisi tablolari ve
          gercek veri ingestion katmani ile genisletmek. Makro artik seed parse demoyu astı; veri
          kaynagi olarak canli veritabanini tercih ediyor.
        </p>
      </section>
    </MakroShell>
  );
}
