import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MakroShell } from "@/components/makro-shell";
import { getCategoryByCode, getMakroData } from "@/lib/get-makro-data";

export const generateStaticParams = async () => {
  const makroData = await getMakroData();

  return makroData.categories.map((category) => ({
    category: category.category,
  }));
};

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ category: string }>;
}) => {
  const { category } = await params;
  const categoryData = await getCategoryByCode(category);

  if (!categoryData) {
    return {
      title: "Category not found",
    } satisfies Metadata;
  }

  return {
    title: `${categoryData.label} · Makro`,
    description: `${categoryData.indicatorCount} indicators and ${categoryData.componentCount} components`,
  } satisfies Metadata;
};

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const categoryData = await getCategoryByCode(category);

  if (!categoryData) {
    notFound();
  }

  return (
    <MakroShell
      eyebrow={categoryData.category}
      title={categoryData.label}
      description={`${categoryData.indicatorCount} indicator ve ${categoryData.componentCount} component bu kategori icinde toplanmis durumda.`}
    >
      <section className="flex flex-wrap gap-3">
        <Link
          href="/categories"
          className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
        >
          Tum kategoriler
        </Link>
        <Link
          href={`/api/categories/${categoryData.category}`}
          className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
        >
          JSON detay
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Indicators
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {categoryData.indicatorCount}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Components
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {categoryData.componentCount}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            API
          </p>
          <Link
            href={`/api/indicators?category=${categoryData.category}`}
            className="mt-3 inline-flex rounded-full border border-accent/20 bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Filtered indicators JSON
          </Link>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {categoryData.indicators.map((indicator) => (
          <article
            key={indicator.indicatorCode}
            className="rounded-[2rem] border border-border bg-card/85 p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {indicator.indicatorCode}
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                  {indicator.indicatorName}
                </h2>
              </div>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                {indicator.frequency}
              </span>
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {indicator.descriptionShort}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">
                {indicator.unit}
              </span>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">
                {indicator.components.length} components
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/indicators/${indicator.indicatorCode}`}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
              >
                Indicator detay
              </Link>
              <Link
                href={`/components?indicatorCode=${indicator.indicatorCode}`}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
              >
                Components
              </Link>
            </div>
          </article>
        ))}
      </section>
    </MakroShell>
  );
}
