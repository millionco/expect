# Makro

Makro is a Next.js application that prefers live PostgreSQL reads and falls back to the local `supabase/seed.sql` file when the database is unavailable.

## Included

- Overview dashboard
- Live data page at `/live`
- Global search
- Quality report
- Taxonomy explorer
- Category explorer
- Indicator library
- Component explorer
- Indicator detail pages
- Source directory
- Country directory
- Export hub at `/exports`
- Setup status page
- JSON API at `/api/seed`
- Live feed API at `/api/live`
- Unified search API at `/api/search`
- Quality API at `/api/quality`
- Taxonomy API at `/api/taxonomy`
- Categories API at `/api/categories`
- Filterable indicators API at `/api/indicators`
- Components API at `/api/components`
- Detail APIs at `/api/indicators/[indicatorCode]`, `/api/sources/[sourceCode]`, and `/api/countries/[isoCode]`
- CSV exports at `/api/exports/indicators.csv`, `/api/exports/sources.csv`, and `/api/exports/countries.csv`
- Component CSV export at `/api/exports/components.csv`
- API manifest at `/api/reference`
- PostgreSQL schema file at `supabase/schema.sql`
- Local database bootstrap with `docker-compose.yml`
- `robots.txt` and `sitemap.xml` routes
- Local seed self-check script at `npm run verify:seed`
- DB-first runtime via `DATABASE_URL` with automatic seed fallback

## Local scripts

- `dev`
- `build`
- `start`
- `lint`
- `typecheck`
- `db:up`
- `db:down`
- `db:reset`
- `db:status`
- `db:logs`
- `db:shell`
- `db:verify`

## Runtime modes

- Database mode: Makro reads directly from PostgreSQL.
- Seed fallback mode: if PostgreSQL is unavailable, Makro parses `supabase/seed.sql` and serves the same product surface.

Default local database target:

- `postgresql://makro:makro@127.0.0.1:54329/makro`

Override it with:

- `DATABASE_URL=postgresql://...`

Current live integrations:

- TCMB daily exchange XML at `https://www.tcmb.gov.tr/kurlar/today.xml`
- TCMB forecast release pages for Piyasa Katılımcıları Anketi and Sektörel Enflasyon Beklentileri
- EVDS3 public JSON forecast endpoint at `https://evds3.tcmb.gov.tr/igmevdsms-dis/fe`

Current honest limitation:

- EVDS3 forecast series are wired with verified default codes. Environment variables are now optional overrides, not blockers.

## Database bootstrap

If Docker is available locally:

- `npm run db:up`
- `npm run db:status`
- `npm run db:logs`
- `npm run db:shell`
- `npm run db:verify`

The container loads:

- `supabase/schema.sql`
- `supabase/seed.sql`
- `supabase/verify.sql`
