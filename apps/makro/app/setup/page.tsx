import { MakroShell } from "@/components/makro-shell";
import { getMakroData } from "@/lib/get-makro-data";

export default async function SetupPage() {
  const makroData = await getMakroData();
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
      eyebrow="Implementation Status"
      title="Kurulumun ne kadarının gerçekten tamamlandığını şeffaf biçimde göster."
      description="Bu sayfa, çalışan parçaları ve hâlâ dış bağımlılık isteyen kısımları dürüstçe ayırıyor."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Runtime source
          </p>
          <p className="mt-3 text-sm leading-6 text-foreground">
            {makroData.dataSource === "database" ? makroData.databaseTarget : makroData.filePath}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Country count
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.countries}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Source count
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.sources}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Indicator count
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
                  completed
                </span>
              )}
              {item.status === "blocked" && (
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                  blocked by environment
                </span>
              )}
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-border bg-card/85 p-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Command runbook
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Start database
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>npm run db:up</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Verify seed
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>npm run db:verify</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Open SQL shell
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>npm run db:shell</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Health endpoint
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/health</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              API reference
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/reference</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Filtered indicators
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/indicators?q=faiz&amp;category=monetary</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Export CSV
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/exports/indicators.csv</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Components API
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/components?indicatorCode=POLICY_RATE</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Global search
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-ink px-4 py-3 font-mono text-xs text-ink-foreground">
              <code>GET /api/search?q=faiz</code>
            </pre>
          </div>
          <div className="rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Quality report
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
