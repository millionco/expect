import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { getEvdsForecastFeed } from "@/lib/get-evds-forecast-feed";
import {
  getDifferenceToneClassName,
  getForecastComparisonRows,
} from "@/lib/get-forecast-comparison-rows";
import { getInternalForecastFeed } from "@/lib/get-internal-forecast-feed";

export default async function ForecastsPage() {
  const [evdsForecastFeed, internalForecastFeed] = await Promise.all([
    getEvdsForecastFeed(),
    getInternalForecastFeed(),
  ]);
  const forecastRows = getForecastComparisonRows(
    evdsForecastFeed.series,
    internalForecastFeed.entries,
  );
  const internalForecastReadyCount = internalForecastFeed.entries.filter(
    (entry) => entry.value !== undefined,
  ).length;

  return (
    <MakroShell
      eyebrow="Tahminler"
      title="Resmi beklenti ve iç tahmin detayları"
      description="Bu yüzey resmi piyasa beklentilerini, bizim tahminlerimizi ve aradaki farkı tek tabloda toplar."
    >
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="makro-surface rounded-[1.75rem] p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            İç tahmin dosyası
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
            Veri girişi burada yapılıyor
          </h2>
          <p className="mt-4 break-all text-sm leading-7 text-foreground">
            {internalForecastFeed.filePath}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-white/55 bg-white/72 p-4 backdrop-blur dark:border-white/10 dark:bg-white/5">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Dolu tahmin
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                {internalForecastReadyCount}/{internalForecastFeed.entries.length}
              </p>
            </article>
            <article className="rounded-2xl border border-white/55 bg-white/72 p-4 backdrop-blur dark:border-white/10 dark:bg-white/5">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Son güncelleme
              </p>
              <p className="mt-2 text-sm leading-7 text-foreground">
                {internalForecastFeed.updatedAt ?? "Girilemedi"}
              </p>
            </article>
          </div>
        </article>

        <article className="makro-surface rounded-[1.75rem] p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Nasıl eklenir
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
            Bizim tahminler nasıl görünür
          </h2>
          <div className="mt-4 grid gap-3">
            <article className="rounded-2xl border border-white/55 bg-white/72 p-4 text-sm leading-7 text-foreground backdrop-blur dark:border-white/10 dark:bg-white/5">
              1. <strong>internal-forecasts.json</strong> içindeki ilgili satırda <strong>value</strong> alanını doldur.
            </article>
            <article className="rounded-2xl border border-white/55 bg-white/72 p-4 text-sm leading-7 text-foreground backdrop-blur dark:border-white/10 dark:bg-white/5">
              2. İstersen <strong>note</strong> alanına model notunu yaz.
            </article>
            <article className="rounded-2xl border border-white/55 bg-white/72 p-4 text-sm leading-7 text-foreground backdrop-blur dark:border-white/10 dark:bg-white/5">
              3. Kaydettiğinde dashboard tablosunda <strong>Girilmedi</strong> yerine sayı görünür.
            </article>
          </div>
        </article>
      </section>

      <section className="makro-surface rounded-[1.75rem] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Tahmin tablosu
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
              Resmi piyasa ve iç tahmin farkı
            </h2>
          </div>
          <Link
            href="/live"
            className="rounded-full border border-white/55 bg-white/72 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur transition-all duration-200 hover:border-accent/30 hover:text-accent dark:border-white/10 dark:bg-white/5"
          >
            Canlı veri
          </Link>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left">
                <th className="px-3 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Gösterge
                </th>
                <th className="px-3 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Resmi piyasa
                </th>
                <th className="px-3 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Bizim tahmin
                </th>
                <th className="px-3 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Fark
                </th>
                <th className="px-3 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Detay
                </th>
              </tr>
            </thead>
            <tbody>
              {forecastRows.map((row) => (
                <tr key={row.key} className="rounded-2xl border border-white/55 bg-white/72 dark:border-white/10 dark:bg-white/5">
                  <td className="rounded-l-2xl px-3 py-4 align-top">
                    <p className="text-sm font-semibold text-foreground">{row.title}</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      Resmi tarih: {row.officialDate}
                    </p>
                  </td>
                  <td className="px-3 py-4 align-top">
                    <p className="text-sm font-semibold text-foreground">{row.officialValue}</p>
                  </td>
                  <td className="px-3 py-4 align-top">
                    <p className="text-sm font-semibold text-foreground">{row.internalValue}</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {row.internalStatus}
                    </p>
                  </td>
                  <td className="px-3 py-4 align-top">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getDifferenceToneClassName(row.difference)}`}
                    >
                      {row.difference}
                    </span>
                  </td>
                  <td className="rounded-r-2xl px-3 py-4 align-top">
                    <Link
                      href={row.detailHref}
                      className="inline-flex rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-all duration-200 hover:border-accent/40"
                    >
                      {row.detailLabel}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </MakroShell>
  );
}
