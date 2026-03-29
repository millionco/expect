import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { getEvdsForecastFeed } from "@/lib/get-evds-forecast-feed";
import { getLiveDashboardFeed } from "@/lib/get-live-dashboard-feed";

export default async function LivePage() {
  const [liveDashboardFeed, evdsForecastFeed] = await Promise.all([
    getLiveDashboardFeed(),
    getEvdsForecastFeed(),
  ]);

  return (
    <MakroShell
      eyebrow="Canlı Veri"
      title="Bugün gerçekten erişebildiğimiz canlı akışları ayrı bir yüzeyde topla."
      description="TCMB günlük kur XML akışı ve resmi beklenti yayın sayfaları burada dürüstçe ayrıştırılıyor."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="makro-surface rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Çekim zamanı
          </p>
          <p className="mt-3 text-sm leading-6 text-foreground">{liveDashboardFeed.fetchedAt}</p>
        </article>
        <article className="makro-surface rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Günlük kur tarihi
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            {liveDashboardFeed.exchangeSnapshot?.date ?? "Yok"}
          </p>
        </article>
        <article className="makro-surface rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Yayın kartı
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            {liveDashboardFeed.forecastReleases.length}
          </p>
        </article>
        <article className="makro-surface rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            EVDS seri
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            {evdsForecastFeed.configuredSeriesCount}
          </p>
        </article>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[0.95fr_1.05fr]">
        <article className="makro-surface rounded-[2rem] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Günlük kurlar
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                TCMB resmi XML akışı
              </h2>
            </div>
            <Link
              href="https://www.tcmb.gov.tr/kurlar/today.xml"
              className="rounded-full border border-white/55 bg-white/72 px-4 py-2 text-sm font-medium text-foreground backdrop-blur transition-all duration-200 hover:border-accent/30 hover:text-accent dark:border-white/10 dark:bg-white/5"
            >
              XML kaynağı
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {liveDashboardFeed.exchangeSnapshot?.quotes.map((quote) => (
              <article
                key={quote.code}
                className="makro-interactive rounded-3xl border border-white/55 bg-white/74 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5"
              >
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {quote.code}
                </p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">{quote.name}</h3>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-foreground">
                  {quote.forexSelling.toFixed(4)}
                </p>
              </article>
            ))}
          </div>
        </article>

        <article className="makro-surface rounded-[2rem] p-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Tahmin yayınları
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              Son resmi beklenti yayınları
            </h2>
          </div>

          <div className="mt-6 grid gap-4">
            {liveDashboardFeed.forecastReleases.map((forecast) => (
              <article
                key={forecast.key}
                className="rounded-3xl border border-white/55 bg-white/74 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">{forecast.title}</h3>
                  <span className="rounded-full border border-white/55 px-3 py-1 text-xs text-muted-foreground dark:border-white/10">
                    {forecast.period}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{forecast.note}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={forecast.sourcePageUrl}
                    className="rounded-full border border-white/55 bg-white/72 px-3 py-2 text-xs font-medium text-foreground backdrop-blur transition-all duration-200 hover:border-accent/30 hover:text-accent dark:border-white/10 dark:bg-white/5"
                  >
                    Kaynak sayfası
                  </Link>
                  {forecast.reportUrl && (
                    <Link
                      href={forecast.reportUrl}
                      className="rounded-full border border-white/55 bg-white/72 px-3 py-2 text-xs font-medium text-foreground backdrop-blur transition-all duration-200 hover:border-accent/30 hover:text-accent dark:border-white/10 dark:bg-white/5"
                    >
                      Rapor PDF
                    </Link>
                  )}
                  {forecast.tableUrl && (
                    <Link
                      href={forecast.tableUrl}
                      className="rounded-full border border-white/55 bg-white/72 px-3 py-2 text-xs font-medium text-foreground backdrop-blur transition-all duration-200 hover:border-accent/30 hover:text-accent dark:border-white/10 dark:bg-white/5"
                    >
                      Tablo PDF
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="makro-surface rounded-[2rem] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              EVDS sayısal tahmin
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              Sayısal beklenti serileri
            </h2>
          </div>
          <Link
            href="https://evds3.tcmb.gov.tr/tumSeriler/1004/bie_pkauo/TP.PKAUO.S01.E.U"
            className="rounded-full border border-white/55 bg-white/72 px-4 py-2 text-sm font-medium text-foreground backdrop-blur transition-all duration-200 hover:border-accent/30 hover:text-accent dark:border-white/10 dark:bg-white/5"
          >
            EVDS ekranını aç
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {evdsForecastFeed.series.map((series) => (
            <article
              key={series.key}
              className="rounded-3xl border border-white/55 bg-white/74 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-semibold tracking-[-0.03em]">{series.label}</h3>
                <span className="rounded-full border border-white/55 px-3 py-1 text-xs text-muted-foreground dark:border-white/10">
                  {series.status === "ready" && "Hazır"}
                  {series.status === "fetch_error" && "Çekilemedi"}
                </span>
              </div>

              {series.status === "ready" && series.latest && (
                <div className="mt-4">
                  <p className="text-4xl font-semibold tracking-[-0.05em] text-foreground">
                    {series.latest.value}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Son gözlem tarihi: {series.latest.date}
                  </p>
                </div>
              )}

              {series.status === "fetch_error" && (
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {series.error ?? "Bu seri için sayısal veri çekilemedi."}
                </p>
              )}

              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                {series.seriesCode}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-6 grid gap-3">
          {evdsForecastFeed.notes.map((note) => (
            <article
              key={note}
              className="rounded-3xl border border-white/55 bg-white/72 p-5 text-sm leading-7 text-muted-foreground backdrop-blur dark:border-white/10 dark:bg-white/5"
            >
              {note}
            </article>
          ))}
        </div>
      </section>

      <section className="makro-surface rounded-[2rem] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Uygulama notları
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              Kaynak eşlemesi ve çalışma biçimi
            </h2>
          </div>
          <Link
            href="/setup"
            className="rounded-full border border-white/55 bg-white/72 px-4 py-2 text-sm font-medium text-foreground backdrop-blur transition-all duration-200 hover:border-accent/30 hover:text-accent dark:border-white/10 dark:bg-white/5"
          >
            Kurulum sayfası
          </Link>
        </div>

        <div className="mt-6 grid gap-4">
          {evdsForecastFeed.requiredEnvVars.map((envVar) => (
            <article
              key={envVar}
              className="rounded-3xl border border-white/55 bg-white/72 p-5 font-mono text-sm leading-7 text-muted-foreground backdrop-blur dark:border-white/10 dark:bg-white/5"
            >
              İsteğe bağlı override: {envVar}
            </article>
          ))}
          {liveDashboardFeed.limitations.map((limitation) => (
            <article
              key={limitation}
              className="rounded-3xl border border-white/55 bg-white/72 p-5 text-sm leading-7 text-muted-foreground backdrop-blur dark:border-white/10 dark:bg-white/5"
            >
              {limitation}
            </article>
          ))}
        </div>
      </section>
    </MakroShell>
  );
}
