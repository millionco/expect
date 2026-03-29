import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { getMakroData, getQualityReport } from "@/lib/get-makro-data";

export default async function QualityPage() {
  const makroData = await getMakroData();
  const qualityReport = await getQualityReport();
  const passingChecks = qualityReport.checks.filter((check) => check.status === "pass").length;
  const warningChecks = qualityReport.checks.filter((check) => check.status === "warn").length;

  return (
    <MakroShell
      eyebrow="Quality Report"
      title="Seed butunlugunu ve kapsami kalite raporuyla gorunur kil."
      description="Kod tekrarlarini, kapsama bosluklarini ve veri dagilimlarini tek bir raporda topluyorum."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Checks
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {qualityReport.checks.length}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Passing
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{passingChecks}</p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Warnings
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{warningChecks}</p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            JSON
          </p>
          <Link
            href="/api/quality"
            className="mt-3 inline-flex rounded-full border border-accent/20 bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Quality API
          </Link>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {qualityReport.checks.map((check) => (
          <article
            key={check.key}
            className="rounded-[2rem] border border-border bg-card/85 p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                {check.title}
              </h2>
              {check.status === "pass" && (
                <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent">
                  pass
                </span>
              )}
              {check.status === "warn" && (
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                  warn
                </span>
              )}
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{check.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="rounded-[2rem] border border-border bg-card/85 p-6">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Frequency distribution
          </p>
          <div className="mt-5 grid gap-3">
            {qualityReport.frequencyDistribution.map((entry) => (
              <div
                key={entry.frequency}
                className="flex items-center justify-between rounded-2xl border border-border bg-background/85 px-4 py-3"
              >
                <span className="text-sm text-foreground">{entry.frequency}</span>
                <span className="font-mono text-sm text-muted-foreground">{entry.count}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-border bg-card/85 p-6">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Category distribution
          </p>
          <div className="mt-5 grid gap-3">
            {qualityReport.categoryDistribution.map((entry) => (
              <div
                key={entry.category}
                className="flex items-center justify-between rounded-2xl border border-border bg-background/85 px-4 py-3"
              >
                <span className="text-sm text-foreground">{entry.label}</span>
                <span className="font-mono text-sm text-muted-foreground">{entry.count}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-border bg-card/85 p-6">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Source type distribution
          </p>
          <div className="mt-5 grid gap-3">
            {qualityReport.sourceTypeDistribution.map((entry) => (
              <div
                key={entry.sourceType}
                className="flex items-center justify-between rounded-2xl border border-border bg-background/85 px-4 py-3"
              >
                <span className="text-sm text-foreground">{entry.sourceType}</span>
                <span className="font-mono text-sm text-muted-foreground">{entry.count}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-border bg-card/85 p-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Coverage snapshot
        </p>
        <p className="mt-4 max-w-4xl text-base leading-7 text-muted-foreground">
          {makroData.counts.indicators} indicator, {makroData.counts.indicatorComponents} component,
          {` ${makroData.counts.sources} `}source ve {makroData.counts.countries} country bu seed icinde
          birlikte dogrulaniyor.
        </p>
      </section>
    </MakroShell>
  );
}
