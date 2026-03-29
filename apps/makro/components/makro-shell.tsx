import Link from "next/link";

const navigation = [
  { href: "/", label: "Overview" },
  { href: "/search", label: "Search" },
  { href: "/quality", label: "Quality" },
  { href: "/taxonomy", label: "Taxonomy" },
  { href: "/categories", label: "Categories" },
  { href: "/indicators", label: "Indicators" },
  { href: "/components", label: "Components" },
  { href: "/countries", label: "Countries" },
  { href: "/sources", label: "Sources" },
  { href: "/exports", label: "Exports" },
  { href: "/setup", label: "Setup" },
  { href: "/api/seed", label: "API" },
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
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
      <header className="rounded-[2rem] border border-border/80 bg-card/90 px-6 py-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 font-medium text-accent">
                21st preset selected: minimal
              </span>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-muted-foreground">
                Turkish macro data workspace
              </span>
            </div>
            <div className="space-y-3">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
                {eyebrow}
              </p>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
                {title}
              </h1>
              <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                {description}
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-2">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:text-accent"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-8 py-8">{children}</div>
    </div>
  </main>
);
