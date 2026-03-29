import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { cache } from "react";
import {
  CATEGORY_ORDER,
  HOME_CATEGORY_PREVIEW_COUNT,
  SQL_PREVIEW_LINE_COUNT,
} from "@/lib/constants";

export interface Country {
  isoCode: string;
  name: string;
  currencyCode: string;
}

export interface Source {
  sourceCode: string;
  sourceName: string;
  sourceType: string;
  baseUrl: string;
  isPrimarySource: boolean;
  reliabilityScore: number;
  notes: string;
}

export interface IndicatorComponent {
  indicatorCode: string;
  componentCode: string;
  componentName: string;
  description: string;
  sortOrder: number;
}

export interface Indicator {
  indicatorCode: string;
  indicatorName: string;
  category: string;
  categoryLabel: string;
  frequency: string;
  unit: string;
  valueType: string;
  seasonalAdjustment: string;
  baseYear: string | null;
  descriptionShort: string;
  descriptionLong: string;
  formulaText: string;
  interpretationText: string;
  learnerNote: string;
  analystNote: string;
  expertNote: string;
  components: IndicatorComponent[];
}

export interface CategorySummary {
  category: string;
  label: string;
  indicatorCount: number;
  highlightedIndicators: Indicator[];
}

export interface IndicatorFilters {
  q?: string;
  category?: string;
  frequency?: string;
}

export interface ComponentFilters {
  q?: string;
  indicatorCode?: string;
}

export interface SearchResult {
  kind: "category" | "indicator" | "component" | "source" | "country";
  key: string;
  title: string;
  description: string;
  href: string;
  tags: string[];
}

export interface QualityCheck {
  key: string;
  title: string;
  status: "pass" | "warn";
  detail: string;
}

export interface QualityReport {
  checks: QualityCheck[];
  frequencyDistribution: Array<{ frequency: string; count: number }>;
  categoryDistribution: Array<{ category: string; label: string; count: number }>;
  sourceTypeDistribution: Array<{ sourceType: string; count: number }>;
}

export interface TaxonomyBucket {
  value: string;
  count: number;
  indicatorCodes: string[];
}

export interface TaxonomyReport {
  frequencies: TaxonomyBucket[];
  units: TaxonomyBucket[];
  valueTypes: TaxonomyBucket[];
  seasonalAdjustments: TaxonomyBucket[];
}

export interface MakroData {
  dataSource: "database" | "seed";
  databaseTarget: string;
  fallbackReason?: string;
  filePath: string;
  sqlPreview: string;
  countries: Country[];
  sources: Source[];
  indicators: Indicator[];
  indicatorComponents: IndicatorComponent[];
  categories: CategorySummary[];
  counts: {
    countries: number;
    sources: number;
    indicators: number;
    indicatorComponents: number;
    primarySources: number;
  };
}

const SEED_FILE_PATH = path.join(process.cwd(), "supabase", "seed.sql");
const DEFAULT_DATABASE_URL = "postgresql://makro:makro@127.0.0.1:54329/makro";

declare global {
  var __makroPoolState:
    | {
        databaseUrl: string;
        pool: Pool;
      }
    | undefined;
}

const normalizeCode = (value: string) => value.trim().toLocaleUpperCase("en-US");
const normalizeSearchText = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .replaceAll(/[\u0300-\u036f]/g, "");

export const getCategoryLabel = (category: string) => {
  switch (category) {
    case "growth":
      return "Büyüme";
    case "inflation":
      return "Enflasyon";
    case "labor":
      return "İşgücü";
    case "external":
      return "Dış Denge";
    case "fiscal":
      return "Kamu Maliyesi";
    case "monetary":
      return "Para Politikası";
    default:
      return category;
  }
};

const getDatabaseUrl = () => process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

const getDatabaseTarget = (databaseUrl: string) => {
  const url = new URL(databaseUrl);
  const host = url.hostname.length > 0 ? url.hostname : "localhost";
  const port = url.port.length > 0 ? url.port : "5432";
  const databaseName = url.pathname.replace(/^\//, "") || "postgres";

  return `${host}:${port}/${databaseName}`;
};

const getPool = (databaseUrl: string) => {
  if (
    globalThis.__makroPoolState &&
    globalThis.__makroPoolState.databaseUrl === databaseUrl
  ) {
    return globalThis.__makroPoolState.pool;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

  globalThis.__makroPoolState = {
    databaseUrl,
    pool,
  };

  return pool;
};

const getInsertValuesBlock = (sql: string, insertMarker: string, endMarker: string) => {
  const insertIndex = sql.indexOf(insertMarker);

  if (insertIndex === -1) {
    throw new Error(`Missing SQL block: ${insertMarker}`);
  }

  const valuesIndex = sql.indexOf("values", insertIndex);
  const endIndex = sql.indexOf(endMarker, valuesIndex);

  if (valuesIndex === -1 || endIndex === -1) {
    throw new Error(`Incomplete SQL block: ${insertMarker}`);
  }

  return sql.slice(valuesIndex + "values".length, endIndex).trim();
};

const parseTupleBlocks = (block: string) => {
  const tuples: string[] = [];
  let currentTuple = "";
  let depth = 0;
  let isInString = false;

  for (let index = 0; index < block.length; index += 1) {
    const character = block[index];
    const nextCharacter = block[index + 1];

    if (character === "'" && isInString && nextCharacter === "'") {
      if (depth > 0) {
        currentTuple += "''";
      }
      index += 1;
      continue;
    }

    if (character === "'") {
      isInString = !isInString;

      if (depth > 0) {
        currentTuple += character;
      }

      continue;
    }

    if (!isInString && character === "(") {
      if (depth > 0) {
        currentTuple += character;
      }
      depth += 1;
      continue;
    }

    if (!isInString && character === ")") {
      depth -= 1;

      if (depth === 0) {
        tuples.push(currentTuple.trim());
        currentTuple = "";
        continue;
      }

      currentTuple += character;
      continue;
    }

    if (depth > 0) {
      currentTuple += character;
    }
  }

  return tuples;
};

const splitTupleFields = (tuple: string) => {
  const fields: string[] = [];
  let currentField = "";
  let nestedDepth = 0;
  let isInString = false;

  for (let index = 0; index < tuple.length; index += 1) {
    const character = tuple[index];
    const nextCharacter = tuple[index + 1];

    if (character === "'" && isInString && nextCharacter === "'") {
      currentField += "''";
      index += 1;
      continue;
    }

    if (character === "'") {
      isInString = !isInString;
      currentField += character;
      continue;
    }

    if (!isInString && character === "(") {
      nestedDepth += 1;
      currentField += character;
      continue;
    }

    if (!isInString && character === ")") {
      nestedDepth -= 1;
      currentField += character;
      continue;
    }

    if (!isInString && nestedDepth === 0 && character === ",") {
      fields.push(currentField.trim());
      currentField = "";
      continue;
    }

    currentField += character;
  }

  if (currentField.trim().length > 0) {
    fields.push(currentField.trim());
  }

  return fields;
};

const parseSqlValue = (value: string) => {
  if (value === "null") {
    return null;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }

  return value;
};

const parseStructuredRows = (block: string) =>
  parseTupleBlocks(block).map((tuple) => splitTupleFields(tuple).map(parseSqlValue));

const findDuplicateValues = (values: string[]) =>
  [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

const buildTaxonomyBuckets = (
  values: Array<{ value: string; indicatorCode: string }>,
) =>
  Array.from(
    values.reduce((distribution, entry) => {
      const currentEntry = distribution.get(entry.value) ?? {
        value: entry.value,
        count: 0,
        indicatorCodes: [] as string[],
      };
      currentEntry.count += 1;
      currentEntry.indicatorCodes.push(entry.indicatorCode);
      distribution.set(entry.value, currentEntry);
      return distribution;
    }, new Map<string, TaxonomyBucket>()),
  )
    .map(([, entry]) => ({
      ...entry,
      indicatorCodes: [...new Set(entry.indicatorCodes)].sort((left, right) =>
        left.localeCompare(right, "en"),
      ),
    }))
    .sort((left, right) => left.value.localeCompare(right.value, "en"));

const groupComponentsByIndicatorCode = (components: IndicatorComponent[]) => {
  const groupedComponents = new Map<string, IndicatorComponent[]>();

  for (const component of components) {
    const currentComponents = groupedComponents.get(component.indicatorCode) ?? [];
    currentComponents.push(component);
    groupedComponents.set(component.indicatorCode, currentComponents);
  }

  return groupedComponents;
};

const loadSeedSql = async () => readFile(SEED_FILE_PATH, "utf8");

const buildMakroData = ({
  dataSource,
  databaseTarget,
  fallbackReason,
  sql,
  countries,
  sources,
  indicators,
  indicatorComponents,
}: {
  dataSource: "database" | "seed";
  databaseTarget: string;
  fallbackReason?: string;
  sql: string;
  countries: Country[];
  sources: Source[];
  indicators: Indicator[];
  indicatorComponents: IndicatorComponent[];
}) => {
  const groupedComponents = groupComponentsByIndicatorCode(indicatorComponents);
  const hydratedIndicators = indicators
    .map((indicator) => ({
      ...indicator,
      categoryLabel: getCategoryLabel(indicator.category),
      components: [...(groupedComponents.get(indicator.indicatorCode) ?? [])].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      ),
    }))
    .sort((left, right) => left.indicatorName.localeCompare(right.indicatorName, "tr"));
  const categories: CategorySummary[] = CATEGORY_ORDER.map((category) => {
    const categoryIndicators = hydratedIndicators.filter(
      (indicator) => indicator.category === category,
    );

    return {
      category,
      label: getCategoryLabel(category),
      indicatorCount: categoryIndicators.length,
      highlightedIndicators: categoryIndicators.slice(0, HOME_CATEGORY_PREVIEW_COUNT),
    };
  }).filter((category) => category.indicatorCount > 0);

  return {
    dataSource,
    databaseTarget,
    fallbackReason,
    filePath: SEED_FILE_PATH,
    sqlPreview: sql.split("\n").slice(0, SQL_PREVIEW_LINE_COUNT).join("\n"),
    countries: [...countries].sort((left, right) => left.name.localeCompare(right.name, "tr")),
    sources: [...sources].sort((left, right) => right.reliabilityScore - left.reliabilityScore),
    indicators: hydratedIndicators,
    indicatorComponents: [...indicatorComponents].sort(
      (left, right) =>
        left.indicatorCode.localeCompare(right.indicatorCode, "en") ||
        left.sortOrder - right.sortOrder,
    ),
    categories,
    counts: {
      countries: countries.length,
      sources: sources.length,
      indicators: hydratedIndicators.length,
      indicatorComponents: indicatorComponents.length,
      primarySources: sources.filter((source) => source.isPrimarySource).length,
    },
  } satisfies MakroData;
};

const loadSeedMakroData = async (
  options: {
    fallbackReason?: string;
    databaseTarget?: string;
  } = {},
) => {
  const sql = await loadSeedSql();
  const countriesRows = parseStructuredRows(
    getInsertValuesBlock(sql, "insert into countries", "on conflict (iso_code)"),
  );
  const sourcesRows = parseStructuredRows(
    getInsertValuesBlock(sql, "insert into sources", "on conflict (source_code)"),
  );
  const indicatorsRows = parseStructuredRows(
    getInsertValuesBlock(sql, "insert into indicators", "on conflict (indicator_code)"),
  );
  const indicatorComponentsRows = parseStructuredRows(
    getInsertValuesBlock(sql, "insert into indicator_components", ") as x("),
  );

  const countries: Country[] = countriesRows.map(([isoCode, name, currencyCode]) => ({
    isoCode: String(isoCode),
    name: String(name),
    currencyCode: String(currencyCode),
  }));
  const sources: Source[] = sourcesRows.map(
    ([
      sourceCode,
      sourceName,
      sourceType,
      baseUrl,
      isPrimarySource,
      reliabilityScore,
      notes,
    ]) => ({
      sourceCode: String(sourceCode),
      sourceName: String(sourceName),
      sourceType: String(sourceType),
      baseUrl: String(baseUrl),
      isPrimarySource: Boolean(isPrimarySource),
      reliabilityScore: Number(reliabilityScore),
      notes: String(notes),
    }),
  );
  const indicators: Indicator[] = indicatorsRows.map(
    ([
      indicatorCode,
      indicatorName,
      category,
      frequency,
      unit,
      valueType,
      seasonalAdjustment,
      baseYear,
      descriptionShort,
      descriptionLong,
      formulaText,
      interpretationText,
      learnerNote,
      analystNote,
      expertNote,
    ]) => ({
      indicatorCode: String(indicatorCode),
      indicatorName: String(indicatorName),
      category: String(category),
      categoryLabel: "",
      frequency: String(frequency),
      unit: String(unit),
      valueType: String(valueType),
      seasonalAdjustment: String(seasonalAdjustment),
      baseYear: baseYear ? String(baseYear) : null,
      descriptionShort: String(descriptionShort),
      descriptionLong: String(descriptionLong),
      formulaText: String(formulaText),
      interpretationText: String(interpretationText),
      learnerNote: String(learnerNote),
      analystNote: String(analystNote),
      expertNote: String(expertNote),
      components: [],
    }),
  );
  const indicatorComponents: IndicatorComponent[] = indicatorComponentsRows.map(
    ([indicatorCode, componentCode, componentName, description, sortOrder]) => ({
      indicatorCode: String(indicatorCode),
      componentCode: String(componentCode),
      componentName: String(componentName),
      description: String(description),
      sortOrder: Number(sortOrder),
    }),
  );

  return buildMakroData({
    dataSource: "seed",
    databaseTarget: options.databaseTarget ?? getDatabaseTarget(getDatabaseUrl()),
    fallbackReason: options.fallbackReason,
    sql,
    countries,
    sources,
    indicators,
    indicatorComponents,
  });
};

const loadDatabaseMakroData = async () => {
  const databaseUrl = getDatabaseUrl();
  const sql = await loadSeedSql();
  const pool = getPool(databaseUrl);
  const [countriesResult, sourcesResult, indicatorsResult, componentsResult] = await Promise.all([
    pool.query<Country>(
      `
        select
          iso_code as "isoCode",
          name,
          currency_code as "currencyCode"
        from countries
        order by name
      `,
    ),
    pool.query<Source>(
      `
        select
          source_code as "sourceCode",
          source_name as "sourceName",
          source_type as "sourceType",
          base_url as "baseUrl",
          is_primary_source as "isPrimarySource",
          reliability_score::float8 as "reliabilityScore",
          notes
        from sources
        order by reliability_score desc, source_code
      `,
    ),
    pool.query<Omit<Indicator, "categoryLabel" | "components">>(
      `
        select
          indicator_code as "indicatorCode",
          indicator_name as "indicatorName",
          category,
          frequency,
          unit,
          value_type as "valueType",
          seasonal_adjustment as "seasonalAdjustment",
          base_year as "baseYear",
          description_short as "descriptionShort",
          description_long as "descriptionLong",
          formula_text as "formulaText",
          interpretation_text as "interpretationText",
          learner_note as "learnerNote",
          analyst_note as "analystNote",
          expert_note as "expertNote"
        from indicators
        order by indicator_name
      `,
    ),
    pool.query<IndicatorComponent>(
      `
        select
          indicators.indicator_code as "indicatorCode",
          indicator_components.component_code as "componentCode",
          indicator_components.component_name as "componentName",
          indicator_components.description,
          indicator_components.sort_order as "sortOrder"
        from indicator_components
        join indicators on indicators.id = indicator_components.indicator_id
        order by indicators.indicator_code, indicator_components.sort_order, indicator_components.component_code
      `,
    ),
  ]);

  return buildMakroData({
    dataSource: "database",
    databaseTarget: getDatabaseTarget(databaseUrl),
    sql,
    countries: countriesResult.rows,
    sources: sourcesResult.rows.map((source) => ({
      ...source,
      isPrimarySource: Boolean(source.isPrimarySource),
      reliabilityScore: Number(source.reliabilityScore),
    })),
    indicators: indicatorsResult.rows.map((indicator) => ({
      ...indicator,
      baseYear: indicator.baseYear ? String(indicator.baseYear) : null,
      categoryLabel: "",
      components: [],
    })),
    indicatorComponents: componentsResult.rows.map((component) => ({
      ...component,
      sortOrder: Number(component.sortOrder),
    })),
  });
};

export const getMakroData = cache(async () => {
  try {
    return await loadDatabaseMakroData();
  } catch (error) {
    return loadSeedMakroData({
      fallbackReason: error instanceof Error ? error.message : String(error),
      databaseTarget: getDatabaseTarget(getDatabaseUrl()),
    });
  }
});

export const filterIndicators = (
  indicators: Indicator[],
  filters: IndicatorFilters,
) => {
  const searchTerm = normalizeSearchText(filters.q ?? "");
  const selectedCategory = (filters.category ?? "").trim();
  const selectedFrequency = (filters.frequency ?? "").trim();

  return indicators.filter((indicator) => {
    const matchesCategory =
      selectedCategory.length === 0 || indicator.category === selectedCategory;
    const matchesFrequency =
      selectedFrequency.length === 0 || indicator.frequency === selectedFrequency;
    const haystack = [
      indicator.indicatorCode,
      indicator.indicatorName,
      indicator.descriptionShort,
      indicator.descriptionLong,
    ]
      .join(" ");

    return (
      matchesCategory &&
      matchesFrequency &&
      (searchTerm.length === 0 || normalizeSearchText(haystack).includes(searchTerm))
    );
  });
};

export const getIndicatorByCode = async (indicatorCode: string) => {
  const makroData = await getMakroData();
  const normalizedIndicatorCode = normalizeCode(indicatorCode);

  return makroData.indicators.find(
    (indicator) => normalizeCode(indicator.indicatorCode) === normalizedIndicatorCode,
  );
};

export const getSourceByCode = async (sourceCode: string) => {
  const makroData = await getMakroData();
  const normalizedSourceCode = normalizeCode(sourceCode);

  return makroData.sources.find(
    (source) => normalizeCode(source.sourceCode) === normalizedSourceCode,
  );
};

export const getCountryByIsoCode = async (isoCode: string) => {
  const makroData = await getMakroData();
  const normalizedIsoCode = normalizeCode(isoCode);

  return makroData.countries.find(
    (country) => normalizeCode(country.isoCode) === normalizedIsoCode,
  );
};

export const filterComponents = (
  components: IndicatorComponent[],
  filters: ComponentFilters,
) => {
  const searchTerm = normalizeSearchText(filters.q ?? "");
  const selectedIndicatorCode = (filters.indicatorCode ?? "").trim();

  return components.filter((component) => {
    const matchesIndicator =
      selectedIndicatorCode.length === 0 || component.indicatorCode === selectedIndicatorCode;
    const haystack = [
      component.indicatorCode,
      component.componentCode,
      component.componentName,
      component.description,
    ]
      .join(" ");

    return (
      matchesIndicator &&
      (searchTerm.length === 0 || normalizeSearchText(haystack).includes(searchTerm))
    );
  });
};

export const getCategoryByCode = async (categoryCode: string) => {
  const makroData = await getMakroData();
  const normalizedCategoryCode = categoryCode.trim().toLocaleLowerCase("en-US");
  const category = makroData.categories.find(
    (entry) => entry.category === normalizedCategoryCode,
  );

  if (!category) {
    return undefined;
  }

  const indicators = makroData.indicators.filter(
    (indicator) => indicator.category === normalizedCategoryCode,
  );
  const componentCount = indicators.reduce(
    (total, indicator) => total + indicator.components.length,
    0,
  );

  return {
    ...category,
    indicators,
    componentCount,
  };
};

export const searchMakroData = async (query: string) => {
  const makroData = await getMakroData();
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery.length === 0) {
    return [];
  }

  const categoryResults: SearchResult[] = makroData.categories
    .filter((category) => {
      const haystack = [category.category, category.label]
        .join(" ");

      return normalizeSearchText(haystack).includes(normalizedQuery);
    })
    .map((category) => ({
      kind: "category",
      key: category.category,
      title: category.label,
      description: `${category.indicatorCount} indicators in ${category.label}`,
      href: `/categories/${category.category}`,
      tags: [category.category, "category"],
    }));

  const indicatorResults: SearchResult[] = makroData.indicators
    .filter((indicator) => {
      const haystack = [
        indicator.indicatorCode,
        indicator.indicatorName,
        indicator.descriptionShort,
        indicator.categoryLabel,
      ]
        .join(" ");

      return normalizeSearchText(haystack).includes(normalizedQuery);
    })
    .map((indicator) => ({
      kind: "indicator",
      key: indicator.indicatorCode,
      title: indicator.indicatorName,
      description: indicator.descriptionShort,
      href: `/indicators/${indicator.indicatorCode}`,
      tags: [indicator.indicatorCode, indicator.category, indicator.frequency],
    }));

  const componentResults: SearchResult[] = makroData.indicatorComponents
    .filter((component) => {
      const haystack = [
        component.indicatorCode,
        component.componentCode,
        component.componentName,
        component.description,
      ]
        .join(" ");

      return normalizeSearchText(haystack).includes(normalizedQuery);
    })
    .map((component) => ({
      kind: "component",
      key: `${component.indicatorCode}:${component.componentCode}`,
      title: component.componentName,
      description: `${component.indicatorCode} · ${component.description}`,
      href: `/components?indicatorCode=${component.indicatorCode}&q=${encodeURIComponent(component.componentCode)}`,
      tags: [component.indicatorCode, component.componentCode, "component"],
    }));

  const sourceResults: SearchResult[] = makroData.sources
    .filter((source) => {
      const haystack = [
        source.sourceCode,
        source.sourceName,
        source.sourceType,
        source.notes,
      ]
        .join(" ");

      return normalizeSearchText(haystack).includes(normalizedQuery);
    })
    .map((source) => ({
      kind: "source",
      key: source.sourceCode,
      title: source.sourceName,
      description: source.notes,
      href: `/sources#${source.sourceCode.toLocaleLowerCase("en-US")}`,
      tags: [source.sourceCode, source.sourceType],
    }));

  const countryResults: SearchResult[] = makroData.countries
    .filter((country) => {
      const haystack = [country.isoCode, country.name, country.currencyCode]
        .join(" ");

      return normalizeSearchText(haystack).includes(normalizedQuery);
    })
    .map((country) => ({
      kind: "country",
      key: country.isoCode,
      title: country.name,
      description: `${country.isoCode} · ${country.currencyCode}`,
      href: `/countries`,
      tags: [country.isoCode, country.currencyCode],
    }));

  return [
    ...categoryResults,
    ...indicatorResults,
    ...componentResults,
    ...sourceResults,
    ...countryResults,
  ];
};

export const getQualityReport = async () => {
  const makroData = await getMakroData();
  const duplicateIndicatorCodes = findDuplicateValues(
    makroData.indicators.map((indicator) => indicator.indicatorCode),
  );
  const duplicateSourceCodes = findDuplicateValues(
    makroData.sources.map((source) => source.sourceCode),
  );
  const duplicateCountryCodes = findDuplicateValues(
    makroData.countries.map((country) => country.isoCode),
  );
  const duplicateComponentKeys = findDuplicateValues(
    makroData.indicatorComponents.map(
      (component) => `${component.indicatorCode}:${component.componentCode}`,
    ),
  );
  const indicatorsWithoutComponents = makroData.indicators.filter(
    (indicator) => indicator.components.length === 0,
  );
  const indicatorsWithoutBaseYear = makroData.indicators.filter(
    (indicator) => indicator.baseYear === null,
  );
  const checks: QualityCheck[] = [
    {
      key: "duplicate-indicators",
      title: "Duplicate indicator codes",
      status: duplicateIndicatorCodes.length === 0 ? "pass" : "warn",
      detail:
        duplicateIndicatorCodes.length === 0
          ? "No duplicate indicator codes found"
          : duplicateIndicatorCodes.join(", "),
    },
    {
      key: "duplicate-sources",
      title: "Duplicate source codes",
      status: duplicateSourceCodes.length === 0 ? "pass" : "warn",
      detail:
        duplicateSourceCodes.length === 0
          ? "No duplicate source codes found"
          : duplicateSourceCodes.join(", "),
    },
    {
      key: "duplicate-countries",
      title: "Duplicate country codes",
      status: duplicateCountryCodes.length === 0 ? "pass" : "warn",
      detail:
        duplicateCountryCodes.length === 0
          ? "No duplicate country codes found"
          : duplicateCountryCodes.join(", "),
    },
    {
      key: "duplicate-components",
      title: "Duplicate component keys",
      status: duplicateComponentKeys.length === 0 ? "pass" : "warn",
      detail:
        duplicateComponentKeys.length === 0
          ? "No duplicate indicator/component pairs found"
          : duplicateComponentKeys.join(", "),
    },
    {
      key: "indicator-components",
      title: "Indicators with component coverage",
      status: indicatorsWithoutComponents.length === 0 ? "pass" : "warn",
      detail:
        indicatorsWithoutComponents.length === 0
          ? "Every indicator has at least one component"
          : indicatorsWithoutComponents.map((indicator) => indicator.indicatorCode).join(", "),
    },
    {
      key: "base-year-coverage",
      title: "Indicators without base year",
      status: indicatorsWithoutBaseYear.length === 0 ? "pass" : "warn",
      detail:
        indicatorsWithoutBaseYear.length === 0
          ? "Every indicator includes a base year"
          : `${indicatorsWithoutBaseYear.length} indicators omit base year`,
    },
  ];
  const frequencyDistribution = Array.from(
    makroData.indicators.reduce((distribution, indicator) => {
      distribution.set(
        indicator.frequency,
        (distribution.get(indicator.frequency) ?? 0) + 1,
      );
      return distribution;
    }, new Map<string, number>()),
  )
    .map(([frequency, count]) => ({ frequency, count }))
    .sort((left, right) => left.frequency.localeCompare(right.frequency, "en"));
  const categoryDistribution = makroData.categories.map((category) => ({
    category: category.category,
    label: category.label,
    count: category.indicatorCount,
  }));
  const sourceTypeDistribution = Array.from(
    makroData.sources.reduce((distribution, source) => {
      distribution.set(source.sourceType, (distribution.get(source.sourceType) ?? 0) + 1);
      return distribution;
    }, new Map<string, number>()),
  )
    .map(([sourceType, count]) => ({ sourceType, count }))
    .sort((left, right) => left.sourceType.localeCompare(right.sourceType, "en"));

  return {
    checks,
    frequencyDistribution,
    categoryDistribution,
    sourceTypeDistribution,
  } satisfies QualityReport;
};

export const getTaxonomyReport = async () => {
  const makroData = await getMakroData();

  return {
    frequencies: buildTaxonomyBuckets(
      makroData.indicators.map((indicator) => ({
        value: indicator.frequency,
        indicatorCode: indicator.indicatorCode,
      })),
    ),
    units: buildTaxonomyBuckets(
      makroData.indicators.map((indicator) => ({
        value: indicator.unit,
        indicatorCode: indicator.indicatorCode,
      })),
    ),
    valueTypes: buildTaxonomyBuckets(
      makroData.indicators.map((indicator) => ({
        value: indicator.valueType,
        indicatorCode: indicator.indicatorCode,
      })),
    ),
    seasonalAdjustments: buildTaxonomyBuckets(
      makroData.indicators.map((indicator) => ({
        value: indicator.seasonalAdjustment,
        indicatorCode: indicator.indicatorCode,
      })),
    ),
  } satisfies TaxonomyReport;
};
