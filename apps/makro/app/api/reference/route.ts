import { NextResponse } from "next/server";

const endpoints = [
  {
    path: "/api/health",
    description: "Basic runtime and seed availability check",
  },
  {
    path: "/api/summary",
    description: "High-level counts, categories, top sources, and featured indicators",
  },
  {
    path: "/api/live",
    description: "Current TCMB exchange snapshot plus official release links and EVDS3 numeric forecast feed",
  },
  {
    path: "/api/atlasian",
    description: "ATLASIAN snapshot payload with source articles, synthesis, mind-map sections, and auto-refresh metadata",
  },
  {
    path: "/api/forecasts",
    description: "Merged official forecast rows with local internal forecast entries",
  },
  {
    path: "/live",
    description: "Dashboard page for current TCMB exchange data, release links, and EVDS3 numeric forecast series",
  },
  {
    path: "/atlasian",
    description: "Dedicated ATLASIAN workspace for source articles, AI synthesis, and the generated mind map",
  },
  {
    path: "/forecasts",
    description: "Dedicated forecast comparison page for official market expectations and internal forecasts",
  },
  {
    path: "/api/seed",
    description: "Full parsed seed payload for countries, sources, and indicators",
  },
  {
    path: "/api/indicators",
    description: "Filterable indicator list with q, category, and frequency query params",
  },
  {
    path: "/api/indicators/[indicatorCode]",
    description: "Single indicator payload including component breakdowns",
  },
  {
    path: "/api/categories",
    description: "Category summaries with indicator and component counts",
  },
  {
    path: "/api/categories/[category]",
    description: "Single category payload with its indicators",
  },
  {
    path: "/api/search",
    description: "Unified search across categories, indicators, components, sources, and countries",
  },
  {
    path: "/api/quality",
    description: "Seed quality checks plus frequency, category, and source-type distributions",
  },
  {
    path: "/api/taxonomy",
    description: "Frequency, unit, value type, and seasonal-adjustment taxonomies",
  },
  {
    path: "/api/sources/[sourceCode]",
    description: "Single source payload",
  },
  {
    path: "/api/countries/[isoCode]",
    description: "Single country payload",
  },
  {
    path: "/api/components",
    description: "Filterable indicator component list with q and indicatorCode query params",
  },
  {
    path: "/api/exports/indicators.csv",
    description: "Indicator export as CSV",
  },
  {
    path: "/api/exports/sources.csv",
    description: "Source export as CSV",
  },
  {
    path: "/api/exports/countries.csv",
    description: "Country export as CSV",
  },
  {
    path: "/api/exports/components.csv",
    description: "Component export as CSV",
  },
];

export const GET = async () =>
  NextResponse.json({
    name: "Makro API",
    endpoints,
    scripts: {
      dev: "npm run dev",
      build: "npm run build",
      verifySeed: "npm run verify:seed",
      dbUp: "npm run db:up",
      dbVerify: "npm run db:verify",
    },
    runtimeNotes: [
      "The app prefers live PostgreSQL reads and falls back to parsing supabase/seed.sql when the database is unavailable.",
      "Set DATABASE_URL to point Makro at a different PostgreSQL instance.",
      "The local Docker bootstrap exposes PostgreSQL on 127.0.0.1:54329 by default.",
    ],
  });
