import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";
import { searchMakroData } from "@/lib/get-makro-data";

const getSingleSearchParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const searchTerm = getSingleSearchParam(resolvedSearchParams.q).trim();
  const results = await searchMakroData(searchTerm);
  const apiHref = searchTerm.length > 0 ? `/api/search?q=${encodeURIComponent(searchTerm)}` : "/api/search";

  return (
    <MakroShell
      eyebrow="Global Search"
      title="Makro evreninin tamamini tek arama kutusundan tara."
      description="Kategori, indikator, component, source ve country katmanlarini tek noktada birlestiriyorum."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Query
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            {searchTerm || "Empty"}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Results
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {results.length}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Search API
          </p>
          <Link
            href={apiHref}
            className="mt-3 inline-flex rounded-full border border-accent/20 bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            JSON
          </Link>
        </article>
        <article className="rounded-3xl border border-border bg-card/85 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Suggestion
          </p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Ornek aramalar: faiz, tuik, repo, buyume, turkiye
          </p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-border bg-card/85 p-6">
        <form className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <label className="grid gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Search
            </span>
            <input
              type="text"
              name="q"
              defaultValue={searchTerm}
              placeholder="faiz, tuik, repo, buyume"
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent/40"
            />
          </label>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="rounded-full border border-accent/20 bg-accent px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Search
            </button>
            <Link
              href="/search"
              className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      {searchTerm.length === 0 && (
        <section className="rounded-[2rem] border border-border bg-card/85 p-8">
          <p className="text-lg font-medium text-foreground">Arama yapmak icin bir ifade gir.</p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Bu ekran tum veri katmanlarini ayni anda tarar ve seni dogru yere yonlendirir.
          </p>
        </section>
      )}

      {searchTerm.length > 0 && results.length === 0 && (
        <section className="rounded-[2rem] border border-border bg-card/85 p-8">
          <p className="text-lg font-medium text-foreground">Sonuc bulunamadi.</p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Baska bir ifade deneyebilir ya da indicators, components, sources ve categories ekranlarina donebilirsin.
          </p>
        </section>
      )}

      {results.length > 0 && (
        <section className="grid gap-4">
          {results.map((result) => (
            <article
              key={`${result.kind}:${result.key}`}
              className="rounded-[2rem] border border-border bg-card/85 p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                      {result.kind}
                    </span>
                    {result.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                    {result.title}
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{result.description}</p>
              <Link
                href={result.href}
                className="mt-5 inline-flex rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
              >
                Sonuca git
              </Link>
            </article>
          ))}
        </section>
      )}
    </MakroShell>
  );
}
