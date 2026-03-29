import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { getMakroData } from "@/lib/get-makro-data";

const exportItems = [
  {
    title: "Indicators CSV",
    href: "/api/exports/indicators.csv",
    description: "Seri kodlari, kategoriler, birimler ve aciklamalar",
  },
  {
    title: "Sources CSV",
    href: "/api/exports/sources.csv",
    description: "Kaynak kodlari, guven skorleri ve ana kaynak bayragi",
  },
  {
    title: "Countries CSV",
    href: "/api/exports/countries.csv",
    description: "Ulke kodu, isim ve para birimi",
  },
  {
    title: "Components CSV",
    href: "/api/exports/components.csv",
    description: "Indikator alt kirilimlari ve siralama bilgisi",
  },
  {
    title: "Full seed JSON",
    href: "/api/seed",
    description: "Ayristrilmis tum seed verisi",
  },
  {
    title: "API reference",
    href: "/api/reference",
    description: "Tum endpointlerin referans listesi",
  },
] as const;

export default async function ExportsPage() {
  const makroData = await getMakroData();

  return (
    <MakroShell
      eyebrow="Exports"
      title="Makro verisini indirilebilir ve entegrasyona hazir hale getir."
      description="Uygulama icindeki seed ayrisimini CSV ve JSON ciktilari olarak disari aciyorum."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Export sets
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">6</p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Indicator rows
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.indicators}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Source rows
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.sources}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Country rows
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.countries}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Component rows
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.indicatorComponents}
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {exportItems.map((item) => (
          <article
            key={item.href}
            className="rounded-[2rem] border border-border bg-card/85 p-6"
          >
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Export
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
              {item.title}
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</p>
            <Link
              href={item.href}
              className="mt-6 inline-flex rounded-full border border-accent/20 bg-accent px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Ac
            </Link>
          </article>
        ))}
      </section>
    </MakroShell>
  );
}
