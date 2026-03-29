import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MakroShell } from "@/components/makro-shell";
import { getFrequencyLabel, getUnitLabel } from "@/lib/format-indicator-labels";
import { getIndicatorByCode, getMakroData } from "@/lib/get-makro-data";

export const generateStaticParams = async () => {
  const makroData = await getMakroData();

  return makroData.indicators.map((indicator) => ({
    indicatorCode: indicator.indicatorCode,
  }));
};

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ indicatorCode: string }>;
}) => {
  const { indicatorCode } = await params;
  const makroData = await getMakroData();
  const indicator = makroData.indicators.find((entry) => entry.indicatorCode === indicatorCode);

  if (!indicator) {
    return {
      title: "Gösterge bulunamadı",
    } satisfies Metadata;
  }

  return {
    title: `${indicator.indicatorName} · Makro`,
    description: indicator.descriptionShort,
  } satisfies Metadata;
};

export default async function IndicatorDetailPage({
  params,
}: {
  params: Promise<{ indicatorCode: string }>;
}) {
  const { indicatorCode } = await params;
  const indicator = await getIndicatorByCode(indicatorCode);

  if (!indicator) {
    notFound();
  }

  return (
    <MakroShell
      eyebrow={indicator.indicatorCode}
      title={indicator.indicatorName}
      description={indicator.descriptionLong}
    >
      <section className="flex flex-wrap gap-3">
        <Link
          href="/indicators"
          className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
        >
          Tüm göstergeler
        </Link>
        <Link
          href={`/api/indicators/${indicator.indicatorCode}`}
          className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
        >
          JSON detay
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Kategori
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
            {indicator.categoryLabel}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Sıklık
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
            {getFrequencyLabel(indicator.frequency)}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Birim
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
            {getUnitLabel(indicator.unit)}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Bileşen
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
            {indicator.components.length}
          </p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="rounded-[2rem] border border-border bg-card/85 p-6">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Yorum
          </p>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {indicator.interpretationText}
          </p>

          <div className="mt-8 grid gap-4">
            <div className="rounded-3xl border border-border bg-background/90 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Formül
              </p>
              <p className="mt-3 font-mono text-sm leading-6 text-foreground">
                {indicator.formulaText}
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-background/90 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Mevsim etkisi
              </p>
              <p className="mt-3 text-sm leading-6 text-foreground">
                {indicator.seasonalAdjustment}
              </p>
            </div>
            {indicator.baseYear && (
              <div className="rounded-3xl border border-border bg-background/90 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  Baz yıl
                </p>
                <p className="mt-3 text-sm leading-6 text-foreground">{indicator.baseYear}</p>
              </div>
            )}
          </div>
        </article>

        <article className="rounded-[2rem] border border-border bg-card/85 p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-border bg-background/90 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Temel not
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{indicator.learnerNote}</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/90 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Analist notu
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{indicator.analystNote}</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/90 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Uzman notu
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{indicator.expertNote}</p>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-border bg-background/90 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Açıklama
            </p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {indicator.descriptionLong}
            </p>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-border bg-card/85 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Bileşenler
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              {indicator.indicatorName} kırılımı
            </h2>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {indicator.components.map((component) => (
            <article
              key={component.componentCode}
              className="rounded-3xl border border-border bg-background/90 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {component.componentCode}
                </p>
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  {component.sortOrder}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em]">
                {component.componentName}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {component.description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </MakroShell>
  );
}
