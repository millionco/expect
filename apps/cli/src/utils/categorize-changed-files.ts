import type { ChangedFile } from "@browser-tester/supervisor";
import { extname } from "node:path";

const COMPONENT_EXTENSIONS = new Set([".tsx", ".jsx"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less", ".styl"]);
const WEB_CODE_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".mts", ".cts"]);
const MARKUP_EXTENSIONS = new Set([".html", ".vue", ".svelte", ".astro"]);

interface FileCategory {
  label: string;
  count: number;
}

interface ChangedFileSummary {
  categories: FileCategory[];
  totalWebFiles: number;
  totalFiles: number;
}

export const categorizeChangedFiles = (files: ChangedFile[]): ChangedFileSummary => {
  let componentCount = 0;
  let styleCount = 0;
  let webCodeCount = 0;
  let markupCount = 0;

  for (const file of files) {
    const extension = extname(file.path).toLowerCase();
    if (COMPONENT_EXTENSIONS.has(extension)) {
      componentCount++;
    } else if (STYLE_EXTENSIONS.has(extension)) {
      styleCount++;
    } else if (WEB_CODE_EXTENSIONS.has(extension)) {
      webCodeCount++;
    } else if (MARKUP_EXTENSIONS.has(extension)) {
      markupCount++;
    }
  }

  const categories: FileCategory[] = [
    { label: "component", count: componentCount },
    { label: "stylesheet", count: styleCount },
    { label: "module", count: webCodeCount },
    { label: "template", count: markupCount },
  ].filter((category) => category.count > 0);

  return {
    categories,
    totalWebFiles: componentCount + styleCount + webCodeCount + markupCount,
    totalFiles: files.length,
  };
};

export const formatFileCategories = (categories: FileCategory[]): string =>
  categories.map(({ label, count }) => `${count} ${label}${count === 1 ? "" : "s"}`).join(", ");
