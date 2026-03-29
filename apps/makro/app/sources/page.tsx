import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { getMakroData } from "@/lib/get-makro-data";

export default async function SourcesPage() {
  const makroData = await getMakroData();

  return (
    <MakroShell
      eyebrow="Source Directory"
      title="Kaynak tabanını güvenilirlik ve rol bazında incele."
      description="Resmi veri sağlayıcılarını, çapraz doğrulama kaynaklarını ve haber akışlarını tek ekranda düzenledim."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Sources
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.sources}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Primary sources
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.primarySources}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5 md:col-span-2">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Strategy
          </p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Öncelik resmi kaynaklarda, destek katmanı ise uluslararası kurum ve yüksek güvenilirlikli
            haber akışlarında. Bu dağılım seed dosyasına doğrudan yansıyor.
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {makroData.sources.map((source) => (
          <article
            key={source.sourceCode}
            className="rounded-[2rem] border border-border bg-card/85 p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {source.sourceCode}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                  {source.sourceName}
                </h2>
              </div>
              <div className="text-right">
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                  {source.sourceType}
                </span>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {source.reliabilityScore}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {source.isPrimarySource && (
                <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent">
                  primary
                </span>
              )}
              {!source.isPrimarySource && (
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                  validation layer
                </span>
              )}
            </div>

            <p className="mt-5 text-sm leading-7 text-muted-foreground">{source.notes}</p>

            <Link
              href={source.baseUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Kaynağı aç
            </Link>
            <Link
              href={`/api/sources/${source.sourceCode}`}
              className="mt-6 ml-3 inline-flex rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              JSON
            </Link>
          </article>
        ))}
      </section>
    </MakroShell>
  );
}
