import type { MetadataRoute } from "next";
import { getMakroData } from "@/lib/get-makro-data";

export default async function sitemap() {
  const makroData = await getMakroData();
  const staticRoutes = [
    "",
    "/atlasian",
    "/forecasts",
    "/live",
    "/search",
    "/quality",
    "/taxonomy",
    "/categories",
    "/indicators",
    "/components",
    "/countries",
    "/sources",
    "/exports",
    "/setup",
  ].map((route) => ({
    url: `http://localhost:3000${route}`,
    lastModified: new Date(),
  }));
  const indicatorRoutes = makroData.indicators.map((indicator) => ({
    url: `http://localhost:3000/indicators/${indicator.indicatorCode}`,
    lastModified: new Date(),
  }));
  const categoryRoutes = makroData.categories.map((category) => ({
    url: `http://localhost:3000/categories/${category.category}`,
    lastModified: new Date(),
  }));

  return [...staticRoutes, ...indicatorRoutes, ...categoryRoutes] satisfies MetadataRoute.Sitemap;
}
