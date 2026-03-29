import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { filterComponents, getMakroData } from "@/lib/get-makro-data";

const getSingleSearchParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
};

export default async function ComponentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    indicatorCode?: string | string[];
  }>;
}) {
  const makroData = await getMakroData();
  const resolvedSearchParams = await searchParams;
  const searchTerm = getSingleSearchParam(resolvedSearchParams.q).trim();
  const selectedIndicatorCode = getSingleSearchParam(resolvedSearchParams.indicatorCode).trim();
  const filteredComponents = filterComponents(makroData.indicatorComponents, {
    q: searchTerm,
    indicatorCode: selectedIndicatorCode,
  });
  const queryString = new URLSearchParams();

  if (searchTerm.length > 0) {
    queryString.set("q", searchTerm);
  }

  if (selectedIndicatorCode.length > 0) {
    queryString.set("indicatorCode", selectedIndicatorCode);
  }

  const apiHref =
    queryString.size > 0 ? `/api/components?${queryString.toString()}` : "/api/components";

  return (
    <MakroShell
      eyebrow="Component Explorer"
      title="Indikator kirilimlarini bagimsiz bir veri katmani olarak incele."
      description="Makro serilerin alt bilesenlerini tek tek aratip ilgili indikatore hizli gecis yapabilirsin."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Components
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {filteredComponents.length}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Indicators
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.indicators}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Selected indicator
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            {selectedIndicatorCode || "All"}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Export
          </p>
          <Link
            href="/api/exports/components.csv"
            className="mt-3 inline-flex rounded-full border border-accent/20 bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Components CSV
          </Link>
        </article>
      </section>

      <section className="rounded-[2rem] border border-border bg-card/85 p-6">
        <form className="grid gap-4 lg:grid-cols-[1fr_280px_240px]">
          <label className="grid gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Search
            </span>
            <input
              type="text"
              name="q"
              defaultValue={searchTerm}
              placeholder="Component code, label, or description"
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent/40"
            />
          </label>
          <label className="grid gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Indicator
            </span>
            <select
              name="indicatorCode"
              defaultValue={selectedIndicatorCode}
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent/40"
            >
              <option value="">All indicators</option>
              {makroData.indicators.map((indicator) => (
                <option key={indicator.indicatorCode} value={indicator.indicatorCode}>
                  {indicator.indicatorCode}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="rounded-full border border-accent/20 bg-accent px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Filter
            </button>
            <Link
              href="/components"
              className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Reset
            </Link>
            <Link
              href={apiHref}
              className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              JSON
            </Link>
          </div>
        </form>
      </section>

      <section className="grid gap-4">
        {filteredComponents.length === 0 && (
          <article className="rounded-[2rem] border border-border bg-card/85 p-8">
            <p className="text-lg font-medium text-foreground">Sonuc bulunamadi.</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Farkli bir component kodu ya da indikator secimi ile tekrar deneyebilirsin.
            </p>
          </article>
        )}

        {filteredComponents.map((component) => (
          <article
            key={`${component.indicatorCode}-${component.componentCode}`}
            className="rounded-[2rem] border border-border bg-card/85 p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                    {component.indicatorCode}
                  </span>
                  <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                    {component.componentCode}
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                  {component.componentName}
                </h2>
              </div>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                order {component.sortOrder}
              </span>
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{component.description}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/indicators/${component.indicatorCode}`}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
              >
                Indicator detay
              </Link>
              <Link
                href={`/api/components?indicatorCode=${component.indicatorCode}`}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
              >
                JSON filtre
              </Link>
            </div>
          </article>
        ))}
      </section>
    </MakroShell>
  );
}
