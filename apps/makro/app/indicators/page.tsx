import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { getFrequencyLabel, getUnitLabel } from "@/lib/format-indicator-labels";
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
  ).sort((left, right) => left.localeCompare(right, "tr"));
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
  const visibleComponentCount = filteredIndicators.reduce(
    (total, indicator) => total + indicator.components.length,
    0,
  );
  const selectedCategoryLabel =
    makroData.categories.find((category) => category.category === selectedCategory)?.label ??
    "Tüm kategoriler";
  const selectedFrequencyLabel =
    selectedFrequency.length > 0 ? getFrequencyLabel(selectedFrequency) : "Tüm sıklıklar";

  return (
    <MakroShell
      eyebrow="Göstergeler"
      title="Makro gösterge listesi"
      description="Bu ekran boş değil; tüm seriler burada. Görünümü sıkıştırdım, gereksiz kartları kaldırdım ve detaylara tek tıkla geçiş ekledim."
    >
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Görünen seri
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground">{filteredIndicators.length}</p>
        </article>
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Bileşen
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground">{visibleComponentCount}</p>
        </article>
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Kategori
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground">{selectedCategoryLabel}</p>
        </article>
        <article className="makro-surface rounded-[1.25rem] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Sıklık
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground">{selectedFrequencyLabel}</p>
        </article>
      </section>

      <section className="makro-surface rounded-[1.5rem] p-4 sm:p-5">
        <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_190px_auto]">
          <label className="grid gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Arama
            </span>
            <input
              type="text"
              name="q"
              defaultValue={searchTerm}
              placeholder="Kod veya gösterge adı"
              className="rounded-2xl border border-border bg-background/92 px-4 py-3 text-sm outline-none transition-colors focus:border-accent/40"
            />
          </label>
          <label className="grid gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Kategori
            </span>
            <select
              name="category"
              defaultValue={selectedCategory}
              className="rounded-2xl border border-border bg-background/92 px-4 py-3 text-sm outline-none transition-colors focus:border-accent/40"
            >
              <option value="">Tüm kategoriler</option>
              {makroData.categories.map((category) => (
                <option key={category.category} value={category.category}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Sıklık
            </span>
            <select
              name="frequency"
              defaultValue={selectedFrequency}
              className="rounded-2xl border border-border bg-background/92 px-4 py-3 text-sm outline-none transition-colors focus:border-accent/40"
            >
              <option value="">Tüm sıklıklar</option>
              {frequencyOptions.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {getFrequencyLabel(frequency)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="submit"
              className="rounded-full border border-accent/20 bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Uygula
            </button>
            <Link
              href="/indicators"
              className="rounded-full border border-border bg-background/92 px-4 py-2.5 text-sm font-medium text-foreground hover:border-accent/30 hover:text-accent"
            >
              Temizle
            </Link>
            <Link
              href={apiHref}
              className="rounded-full border border-border bg-background/92 px-4 py-2.5 text-sm font-medium text-foreground hover:border-accent/30 hover:text-accent"
            >
              JSON
            </Link>
          </div>
        </form>
      </section>

      <section className="makro-surface rounded-[1.5rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Seri listesi
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
              Görünen göstergeler
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Kodlara veya satırdaki düğmeye tıklayarak detay ekranına girebilirsin.
          </p>
        </div>

        {filteredIndicators.length === 0 && (
          <article className="mt-4 rounded-2xl border border-border bg-background/92 p-5">
            <p className="text-sm font-medium text-foreground">Sonuç bulunamadı.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Farklı bir arama ifadesi, kategori veya sıklık seçerek tekrar deneyebilirsin.
            </p>
          </article>
        )}

        {filteredIndicators.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[68rem] border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left">
                  <th className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Kod
                  </th>
                  <th className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Gösterge
                  </th>
                  <th className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Kategori
                  </th>
                  <th className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Sıklık
                  </th>
                  <th className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Birim
                  </th>
                  <th className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Bileşen
                  </th>
                  <th className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Detay
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredIndicators.map((indicator) => (
                  <tr
                    key={indicator.indicatorCode}
                    className="rounded-2xl border border-border bg-background/92 text-sm"
                  >
                    <td className="rounded-l-2xl px-3 py-3 align-top font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {indicator.indicatorCode}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-foreground">{indicator.indicatorName}</p>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                        {indicator.descriptionShort}
                      </p>
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground">
                      {indicator.categoryLabel}
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground">
                      {getFrequencyLabel(indicator.frequency)}
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground">
                      {getUnitLabel(indicator.unit)}
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground">
                      {indicator.components.length}
                    </td>
                    <td className="rounded-r-2xl px-3 py-3 align-top">
                      <Link
                        href={`/indicators/${indicator.indicatorCode}`}
                        className="inline-flex rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:border-accent/35"
                      >
                        Aç
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </MakroShell>
  );
}
