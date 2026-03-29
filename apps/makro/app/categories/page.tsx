import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { getMakroData } from "@/lib/get-makro-data";

export default async function CategoriesPage() {
  const makroData = await getMakroData();

  return (
    <MakroShell
      eyebrow="Category Explorer"
      title="Makro evrenini kategori bazinda tarayip her kulvarin kapsamini gor."
      description="Buyume, enflasyon, isgucu ve diger kulvarlari ayri bilgi alanlari olarak sunuyorum."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Categories
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.categories.length}
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
            Components
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.indicatorComponents}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            API
          </p>
          <Link
            href="/api/categories"
            className="mt-3 inline-flex rounded-full border border-accent/20 bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Categories JSON
          </Link>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {makroData.categories.map((category) => {
          const componentCount = makroData.indicators
            .filter((indicator) => indicator.category === category.category)
            .reduce((total, indicator) => total + indicator.components.length, 0);

          return (
            <article
              key={category.category}
              className="rounded-[2rem] border border-border bg-card/85 p-6"
            >
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                {category.category}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                {category.label}
              </h2>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">
                  {category.indicatorCount} indicators
                </span>
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">
                  {componentCount} components
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {category.highlightedIndicators.map((indicator) => (
                  <Link
                    key={indicator.indicatorCode}
                    href={`/indicators/${indicator.indicatorCode}`}
                    className="rounded-full border border-border bg-background px-3 py-2 font-mono text-xs text-foreground transition-colors hover:border-accent/30 hover:text-accent"
                  >
                    {indicator.indicatorCode}
                  </Link>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/categories/${category.category}`}
                  className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
                >
                  Category detay
                </Link>
                <Link
                  href={`/api/categories/${category.category}`}
                  className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
                >
                  JSON
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </MakroShell>
  );
}
