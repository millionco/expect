import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { getMakroData } from "@/lib/get-makro-data";

export default async function CountriesPage() {
  const makroData = await getMakroData();

  return (
    <MakroShell
      eyebrow="Country Directory"
      title="Seed içinde tanımlı ülke bazını sade biçimde göster."
      description="Makro veri evreninin hangi ülke ve para birimi üzerine kurulduğunu tek ekranda netleştiriyor."
    >
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Countries
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {makroData.counts.countries}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Base market
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Turkey</p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Currency
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">TRY</p>
        </article>
      </section>

      <section className="grid gap-4">
        {makroData.countries.map((country) => (
          <article
            key={country.isoCode}
            className="rounded-[2rem] border border-border bg-card/85 p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {country.isoCode}
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{country.name}</h2>
              </div>
              <div className="rounded-full border border-border bg-background px-4 py-2 font-mono text-sm text-foreground">
                {country.currencyCode}
              </div>
            </div>
            <Link
              href={`/api/countries/${country.isoCode}`}
              className="mt-5 inline-flex rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              JSON detay
            </Link>
          </article>
        ))}
      </section>
    </MakroShell>
  );
}
