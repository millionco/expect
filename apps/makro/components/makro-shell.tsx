import Link from "next/link";

interface NavigationItem {
  href: string;
  label: string;
}

interface NavigationSection {
  title: string;
  items: ReadonlyArray<NavigationItem>;
}

const navigationSections: ReadonlyArray<NavigationSection> = [
  {
    title: "Kontrol Merkezi",
    items: [
      { href: "/", label: "Genel Bakış" },
      { href: "/atlasian", label: "ATLASIAN" },
      { href: "/forecasts", label: "Tahminler" },
      { href: "/live", label: "Canlı Veri" },
      { href: "/haber-agi", label: "Haber Ağı" },
      { href: "/agents", label: "Ajan Durumu" },
      { href: "/search", label: "Arama" },
      { href: "/quality", label: "Kalite" },
      { href: "/taxonomy", label: "Taksonomi" },
    ],
  },
  {
    title: "Veri Katmanları",
    items: [
      { href: "/categories", label: "Kategoriler" },
      { href: "/indicators", label: "Göstergeler" },
      { href: "/components", label: "Bileşenler" },
      { href: "/sources", label: "Kaynaklar" },
      { href: "/countries", label: "Ülkeler" },
    ],
  },
  {
    title: "Operasyon",
    items: [
      { href: "/exports", label: "Dışa Aktarım" },
      { href: "/setup", label: "Kurulum" },
      { href: "/api/reference", label: "API Referansı" },
    ],
  },
];

const mobileNavigationItems: ReadonlyArray<NavigationItem> = [
  { href: "/", label: "Genel Bakış" },
  { href: "/atlasian", label: "ATLASIAN" },
  { href: "/forecasts", label: "Tahminler" },
  { href: "/live", label: "Canlı Veri" },
  { href: "/haber-agi", label: "Haber Ağı" },
  { href: "/agents", label: "Ajan Durumu" },
  { href: "/search", label: "Arama" },
  { href: "/quality", label: "Kalite" },
  { href: "/taxonomy", label: "Taksonomi" },
  { href: "/categories", label: "Kategoriler" },
  { href: "/indicators", label: "Göstergeler" },
  { href: "/components", label: "Bileşenler" },
  { href: "/sources", label: "Kaynaklar" },
  { href: "/countries", label: "Ülkeler" },
  { href: "/exports", label: "Dışa Aktarım" },
  { href: "/setup", label: "Kurulum" },
  { href: "/api/reference", label: "API Referansı" },
];

export const MakroShell = ({
  children,
  eyebrow,
  title,
  description,
}: Readonly<{
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}>) => (
  <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto w-full max-w-[100rem] px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="makro-surface sticky top-4 hidden h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[1.5rem] xl:flex">
          <div className="makro-grid pointer-events-none absolute inset-0 opacity-35" />
          <div className="relative flex h-full flex-col px-5 py-5">
            <div className="rounded-[1.25rem] border border-border bg-background/90 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                Makro
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">Veri masası</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Güncel veri, resmi beklenti ve iç tahmin akışını aynı çalışma alanında toplar.
              </p>
            </div>

            <div className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1">
              {navigationSections.map((section) => (
                <section key={section.title} className="space-y-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    {section.title}
                  </p>
                  <div className="grid gap-2">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="makro-interactive rounded-2xl border border-border bg-background/90 px-4 py-3 text-sm font-medium text-foreground hover:border-accent/30 hover:text-accent"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-5 rounded-[1.25rem] border border-accent/18 bg-accent/8 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                Dürüst durum
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                Güncel resmi veri ve tahmin akışı için ayrı feed gerektiren alanlar açıkça işaretlenir;
                eksik veri uydurulmaz.
              </p>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="makro-surface relative overflow-hidden rounded-[1.5rem] px-5 py-5 sm:px-6 xl:px-7">
            <div className="makro-grid pointer-events-none absolute inset-0 opacity-35" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/35 to-transparent" />

            <div className="relative flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3 xl:hidden">
                <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 font-medium text-accent">
                  Makro veri masası
                </span>
                <span className="rounded-full border border-border bg-background/90 px-3 py-1 text-muted-foreground">
                  Türkçe çalışma alanı
                </span>
              </div>

              <div className="space-y-3">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
                  {eyebrow}
                </p>
                <h1 className="max-w-5xl text-2xl font-semibold tracking-[-0.04em] text-balance sm:text-3xl xl:text-[2.75rem] xl:leading-[1.02]">
                  {title}
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                  {description}
                </p>
              </div>

              <nav className="flex flex-wrap gap-2 xl:hidden">
                {mobileNavigationItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="makro-interactive rounded-full border border-border bg-background/90 px-4 py-2 text-sm font-medium text-foreground hover:border-accent/30 hover:text-accent"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-6 py-6 [content-visibility:auto]">{children}</div>
        </div>
      </div>
    </div>
  </main>
);
