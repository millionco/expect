import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { filterIndicators, getMakroData } from "@/lib/get-makro-data";

const getSingleSearchParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
};

export default async function IndicatorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    frequency?: string | string[];
  }>;
}) {
  const makroData = await getMakroData();
  const resolvedSearchParams = await searchParams;
  const searchTerm = getSingleSearchParam(resolvedSearchParams.q).trim();
  const selectedCategory = getSingleSearchParam(resolvedSearchParams.category).trim();
  const selectedFrequency = getSingleSearchParam(resolvedSearchParams.frequency).trim();
  const filteredIndicators = filterIndicators(makroData.indicators, {
    q: searchTerm,
    category: selectedCategory,
    frequency: selectedFrequency,
  });
  const frequencyOptions = Array.from(
    new Set(makroData.indicators.map((indicator) => indicator.frequency)),
  ).sort((left, right) => left.localeCompare(right, "en"));
  const queryString = new URLSearchParams();

  if (searchTerm.length > 0) {
    queryString.set("q", searchTerm);
  }

  if (selectedCategory.length > 0) {
    queryString.set("category", selectedCategory);
  }

  if (selectedFrequency.length > 0) {
    queryString.set("frequency", selectedFrequency);
  }

  const apiHref =
    queryString.size > 0 ? `/api/indicators?${queryString.toString()}` : "/api/indicators";

  const visibleCategories = makroData.categories
    .map((category) => {
      const categoryIndicators = filteredIndicators.filter(
        (indicator) => indicator.category === category.category,
      );

      return {
        ...category,
        indicatorCount: categoryIndicators.length,
        indicators: categoryIndicators,
      };
    })
    .filter((category) => category.indicatorCount > 0);

  return (
    <MakroShell
      eyebrow="Indicator Library"
      title="Tüm makro indikatörleri kategori bazında incele."
      description="Her seri için kısa açıklama, ölçüm mantığı, uzman notları ve bileşen yapısını tek yerde topladım."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Indicators
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {filteredIndicators.length}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Components
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.indicatorComponents}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5 md:col-span-3">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Coverage
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {makroData.categories.map((category) => (
              <span
                key={category.category}
                className="rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {category.label} · {category.indicatorCount}
              </span>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-border bg-card/85 p-6">
        <form className="grid gap-4 lg:grid-cols-[1fr_220px_220px_240px]">
          <label className="grid gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Search
            </span>
            <input
              type="text"
              name="q"
              defaultValue={searchTerm}
              placeholder="Indicator code or title"
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent/40"
            />
          </label>
          <label className="grid gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Category
            </span>
            <select
              name="category"
              defaultValue={selectedCategory}
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent/40"
            >
              <option value="">All categories</option>
              {makroData.categories.map((category) => (
                <option key={category.category} value={category.category}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Frequency
            </span>
            <select
              name="frequency"
              defaultValue={selectedFrequency}
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent/40"
            >
              <option value="">All frequencies</option>
              {frequencyOptions.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {frequency}
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
              href="/indicators"
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

      <section className="grid gap-6">
        {visibleCategories.length === 0 && (
          <article className="rounded-[2rem] border border-border bg-card/85 p-8">
            <p className="text-lg font-medium text-foreground">Sonuc bulunamadi.</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Farkli bir arama ifadesi ya da kategori secerek tekrar deneyebilirsin.
            </p>
          </article>
        )}

        {visibleCategories.map((category) => (
          <article
            key={category.category}
            className="rounded-[2rem] border border-border bg-card/85 p-6"
          >
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {category.label}
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                  {category.indicatorCount} seri
                </h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {category.indicators.map((indicator) => (
                <Link
                  key={indicator.indicatorCode}
                  href={`/indicators/${indicator.indicatorCode}`}
                  className="rounded-3xl border border-border bg-background/85 p-5 transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                      {indicator.indicatorCode}
                    </span>
                    <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                      {indicator.frequency}
                    </span>
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">
                    {indicator.indicatorName}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {indicator.descriptionShort}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                      {indicator.unit}
                    </span>
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                      {indicator.valueType}
                    </span>
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                      {indicator.components.length} components
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>
    </MakroShell>
  );
}
