import Link from "next/link";
import { MakroShell } from "@/components/makro-shell";

export default function NotFound() {
  return (
    <MakroShell
      eyebrow="Not Found"
      title="Aradigin sayfa Makro icinde bulunamadi."
      description="Rota mevcut olmayabilir ya da istedigin kod seed dosyasinda tanimli olmayabilir."
    >
      <section className="rounded-[2rem] border border-border bg-card/85 p-8">
        <div className="max-w-2xl space-y-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Recovery
          </p>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
            Uygulama calisiyor, ama bu hedef icin veri ya da rota eslesmesi yok.
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            Overview, indicators, countries, sources ve setup ekranlarina geri donebilirsin.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-full border border-accent/20 bg-accent px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Overview
            </Link>
            <Link
              href="/indicators"
              className="rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
            >
              Indicators
            </Link>
          </div>
        </div>
      </section>
    </MakroShell>
  );
}
