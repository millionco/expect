import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { getNewsFeed } from "@/lib/get-news-feed";
import { NEWS_FEED_SOURCES } from "@/lib/get-news-feed";

const formatRelativeTime = (isoDate: string) => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);

  if (minutes < 1) return "Az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  if (hours < 24) return `${hours} sa önce`;
  return new Date(isoDate).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const CATEGORY_LABEL: Record<string, string> = {
  finans: "Finans",
  ekonomi: "Ekonomi",
  resmi: "Resmi",
};

export default async function HaberAgiPage() {
  const newsFeed = await getNewsFeed();
  const okSources = newsFeed.sources.filter((s) => s.ok);
  const failedSources = newsFeed.sources.filter((s) => !s.ok);

  return (
    <MakroShell
      eyebrow="Haber Ağı"
      title="Ekonomi ve piyasa haberleri"
      description={`${NEWS_FEED_SOURCES.length} kaynak izleniyor — ${okSources.length} aktif, ${newsFeed.items.length} haber yüklendi. Her 5 dakikada yenilenir.`}
    >
      {/* Kaynak Durumu */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Toplam kaynak
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {NEWS_FEED_SOURCES.length}
          </p>
        </article>
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Aktif kaynak
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {okSources.length}
          </p>
        </article>
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Yüklenen haber
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {newsFeed.items.length}
          </p>
        </article>
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Son güncelleme
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {new Date(newsFeed.fetchedAt).toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </article>
      </section>

      {/* Haber Akışı */}
      <section className="makro-surface rounded-[1.5rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Haber akışı
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
              Son haberler
            </h2>
          </div>
          <Link
            href="/agents"
            className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/30 hover:text-accent"
          >
            Kaynak durumu
          </Link>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {newsFeed.items.map((item) => (
            <Link
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="makro-interactive group rounded-2xl border border-border bg-background/92 px-4 py-3 hover:border-accent/30"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full border border-border bg-background/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {item.sourceLabel}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  {formatRelativeTime(item.publishedAt)}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium leading-5 text-foreground group-hover:text-accent line-clamp-3">
                {item.title}
              </p>
              {item.description && (
                <p className="mt-1.5 text-xs leading-4 text-muted-foreground line-clamp-2">
                  {item.description}
                </p>
              )}
            </Link>
          ))}
        </div>

        {newsFeed.items.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Şu an haber kaynakları erişilemiyor. Lütfen daha sonra tekrar deneyin.
          </p>
        )}
      </section>

      {/* Kaynak Listesi */}
      <section className="makro-surface rounded-[1.5rem] p-4 sm:p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Kaynak dizini
        </p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
          İzlenen kaynaklar
        </h2>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {newsFeed.sources.map((sourceStatus) => {
            const sourceDef = NEWS_FEED_SOURCES.find((s) => s.id === sourceStatus.id);
            return (
              <div
                key={sourceStatus.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-background/92 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{sourceStatus.label}</p>
                  {sourceDef && (
                    <span className="mt-1 inline-flex rounded-full border border-border bg-background/90 px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                      {CATEGORY_LABEL[sourceDef.category] ?? sourceDef.category}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {sourceStatus.ok && (
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {sourceStatus.itemCount} haber
                    </span>
                  )}
                  <span
                    className={`h-2 w-2 rounded-full ${sourceStatus.ok ? "bg-emerald-500" : "bg-red-500"}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {failedSources.length > 0 && (
          <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {failedSources.length} kaynak şu an erişilemiyor
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {failedSources.map((s) => s.label).join(", ")}
            </p>
          </div>
        )}
      </section>
    </MakroShell>
  );
}
