import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { getTaxonomyReport } from "@/lib/get-makro-data";

const taxonomySections = [
  {
    key: "frequencies",
    title: "Frequency",
    description: "Aylik ve ceyreklik dagilim",
  },
  {
    key: "units",
    title: "Unit",
    description: "Olcum birimlerinin dagilimi",
  },
  {
    key: "valueTypes",
    title: "Value type",
    description: "Level, rate ve ratio gibi yorum katmanlari",
  },
  {
    key: "seasonalAdjustments",
    title: "Seasonal adjustment",
    description: "SA ve NSA dagilimlari",
  },
] as const;

export default async function TaxonomyPage() {
  const taxonomyReport = await getTaxonomyReport();

  return (
    <MakroShell
      eyebrow="Taxonomy"
      title="Makro metadata boyutlarini tek ekranda siniflandir."
      description="Indicator evrenini frequency, unit, value type ve seasonal adjustment eksenlerinde okuyabilirsin."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {taxonomySections.map((section) => (
          <article
            key={section.key}
            className="rounded-3xl border border-border bg-card/85 p-5"
          >
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              {section.title}
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
              {taxonomyReport[section.key].length}
            </p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.description}</p>
          </article>
        ))}
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          href="/api/taxonomy"
          className="rounded-full border border-accent/20 bg-accent px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Taxonomy API
        </Link>
        <Link
          href="/quality"
          className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
        >
          Quality report
        </Link>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {taxonomySections.map((section) => (
          <article
            key={section.key}
            className="rounded-[2rem] border border-border bg-card/85 p-6"
          >
            <div className="border-b border-border pb-5">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                {section.title}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                {section.description}
              </h2>
            </div>
            <div className="mt-5 grid gap-4">
              {taxonomyReport[section.key].map((bucket) => (
                <article
                  key={bucket.value}
                  className="rounded-3xl border border-border bg-background/85 p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                      {bucket.value}
                    </h3>
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                      {bucket.count} indicators
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {bucket.indicatorCodes.map((indicatorCode) => (
                      <Link
                        key={indicatorCode}
                        href={`/indicators/${indicatorCode}`}
                        className="rounded-full border border-border bg-card px-3 py-2 font-mono text-xs text-foreground transition-colors hover:border-accent/30 hover:text-accent"
                      >
                        {indicatorCode}
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </article>
        ))}
      </section>
    </MakroShell>
  );
}
