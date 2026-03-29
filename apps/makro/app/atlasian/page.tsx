import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { runAtlasianForecast } from "@/lib/get-atlasian-forecast";

export const dynamic = "force-dynamic";

const formatGeneratedAt = (value: string) =>
  new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatPublishedAt = (value: string | undefined) => {
  if (!value) {
    return "Tarih yok";
  }

  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getSentimentLabel = (value: "positive" | "neutral" | "negative") => {
  if (value === "positive") {
    return "Olumlu";
  }

  if (value === "negative") {
    return "Olumsuz";
  }

  return "Nötr";
};

export default async function AtlasianPage() {
  const atlasian = await runAtlasianForecast();
  const activeSources = atlasian.sourceStatuses.filter((sourceStatus) => sourceStatus.ok);

  return (
    <MakroShell
      eyebrow="ATLASIAN"
      title="Hangi haberleri baz aldığını, ne düşündüğünü ve nasıl bağ kurduğunu gör."
      description="Bu yüzey her yenilemede seçili kaynakların son RSS akışını toplar, ATLASIAN analizini üretir ve sonucu zihin haritası halinde açar."
    >
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Aktif kaynak
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {activeSources.length}/{atlasian.sourceStatuses.length}
          </p>
        </article>
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Baz alınan haber
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {atlasian.articles.length}
          </p>
        </article>
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Tema
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {atlasian.keyThemes.length}
          </p>
        </article>
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Tahmin
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {atlasian.forecasts.length}
          </p>
        </article>
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Son üretim
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {formatGeneratedAt(atlasian.generatedAt)}
          </p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="makro-surface rounded-[1.5rem] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Çalışma biçimi
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
                Her yenilemede nasıl güncelleniyor
              </h2>
            </div>
            <Link
              href="/atlasian"
              className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/30 hover:text-accent"
            >
              Sayfayı yenile
            </Link>
          </div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-border bg-background/90 p-4 text-sm leading-7 text-muted-foreground">
              1. Sayfa açıldığında WSJ, CNBC, Yahoo Finance, Investing.com ve CoinDesk RSS akışları yeniden çekilir.
            </div>
            <div className="rounded-2xl border border-border bg-background/90 p-4 text-sm leading-7 text-muted-foreground">
              2. Başlıklar ve kısa özetler ATLASIAN analiz girdisine dönüştürülür.
            </div>
            <div className="rounded-2xl border border-border bg-background/90 p-4 text-sm leading-7 text-muted-foreground">
              3. Analiz sonucu özet, tema, tahmin ve zihin haritası olarak açılır.
            </div>
            <div className="rounded-2xl border border-border bg-background/90 p-4 text-sm leading-7 text-muted-foreground">
              4. Kod bağlamı için kullanılan belge: <span className="font-mono text-foreground">{atlasian.contextDocumentPath}</span>
            </div>
          </div>
        </article>

        <article className="makro-surface rounded-[1.5rem] p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Analiz özeti
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
            ATLASIAN sentezi
          </h2>
          <div className="mt-4 rounded-2xl border border-border bg-background/90 p-4">
            <p className="text-sm leading-7 text-foreground">{atlasian.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                Duygu: {getSentimentLabel(atlasian.sentiment)}
              </span>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                Haber: {atlasian.newsItemCount}
              </span>
              {atlasian.error && (
                <span className="rounded-full border border-rose-300/40 bg-rose-400/10 px-3 py-1 text-xs text-rose-700 dark:border-rose-200/20 dark:bg-rose-300/10 dark:text-rose-100">
                  Hata: {atlasian.error}
                </span>
              )}
            </div>
            {atlasian.keyThemes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {atlasian.keyThemes.map((theme) => (
                  <span
                    key={theme}
                    className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="makro-surface rounded-[1.5rem] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Zihin haritası
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
              Kaynaklar, temalar ve tahminler
            </h2>
          </div>
        </div>
        <div className="mt-4 rounded-[1.5rem] border border-accent/15 bg-accent/6 p-5">
          <div className="rounded-2xl border border-accent/20 bg-background/90 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
              {atlasian.mindMap.centralLabel}
            </p>
            <p className="mt-2 text-sm leading-7 text-foreground">{atlasian.mindMap.centralSummary}</p>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-4">
            {atlasian.mindMap.sections.map((section) => (
              <article
                key={section.id}
                className="rounded-2xl border border-border bg-background/90 p-4"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  {section.title}
                </p>
                <div className="mt-3 grid gap-2">
                  {section.items.length === 0 && (
                    <p className="text-xs text-muted-foreground">Bu katmanda henüz veri yok.</p>
                  )}
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    >
                      {item.href && (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-foreground hover:text-accent"
                        >
                          {item.label}
                        </a>
                      )}
                      {!item.href && (
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                      )}
                      {item.description && (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="makro-surface rounded-[1.5rem] p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Baz alınan kaynaklar
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
            Hangi kaynaklar okundu
          </h2>
          <div className="mt-4 grid gap-2">
            {atlasian.sourceStatuses.map((sourceStatus) => (
              <a
                key={sourceStatus.id}
                href={sourceStatus.url}
                target="_blank"
                rel="noopener noreferrer"
                className="makro-interactive flex items-center justify-between rounded-2xl border border-border bg-background/90 px-4 py-3 hover:border-accent/30"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{sourceStatus.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{sourceStatus.url}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-foreground">
                    {sourceStatus.ok && `${sourceStatus.itemCount} haber`}
                    {!sourceStatus.ok && "erişilemedi"}
                  </p>
                  <span
                    className={`mt-1 inline-flex h-2 w-2 rounded-full ${sourceStatus.ok ? "bg-emerald-500" : "bg-rose-500"}`}
                  />
                </div>
              </a>
            ))}
          </div>
        </article>

        <article className="makro-surface rounded-[1.5rem] p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Baz alınan haberler
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
            Analize giren başlıklar
          </h2>
          <div className="mt-4 grid gap-2">
            {atlasian.articles.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Bu turda ATLASIAN için okunabilir haber bulunamadı.
              </p>
            )}
            {atlasian.articles.map((article) => (
              <article
                key={article.id}
                className="rounded-2xl border border-border bg-background/90 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    {article.sourceLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatPublishedAt(article.publishedAt)}
                  </span>
                </div>
                {article.link && (
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block text-sm font-medium leading-6 text-foreground hover:text-accent"
                  >
                    {article.title}
                  </a>
                )}
                {!article.link && (
                  <p className="mt-2 text-sm font-medium leading-6 text-foreground">{article.title}</p>
                )}
                {article.description && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{article.description}</p>
                )}
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="makro-surface rounded-[1.5rem] p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Tahmin çıktısı
        </p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
          ATLASIAN tahminleri
        </h2>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {atlasian.forecasts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Tahmin üretilemedi. Ana neden genelde `ANTHROPIC_API_KEY` eksikliği veya kaynak erişim sorunudur.
            </p>
          )}
          {atlasian.forecasts.map((forecast) => (
            <article
              key={forecast.key}
              className="rounded-2xl border border-border bg-background/90 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{forecast.label}</p>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                  {forecast.confidence}
                </span>
              </div>
              <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-accent">
                {forecast.value === null && "—"}
                {forecast.value !== null && forecast.value.toFixed(2)}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{forecast.rationale}</p>
            </article>
          ))}
        </div>
      </section>
    </MakroShell>
  );
}
