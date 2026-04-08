import { ConfigRecord } from "./config-types";

export const deepMerge = (target: ConfigRecord, source: ConfigRecord): ConfigRecord => {
  const mergedConfig: ConfigRecord = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = mergedConfig[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue)
    ) {
      mergedConfig[key] = deepMerge(
        targetValue !== undefined && typeof targetValue === "object" && !Array.isArray(targetValue)
          ? (targetValue as ConfigRecord)
          : {},
        sourceValue as ConfigRecord,
      );
      continue;
    }

    mergedConfig[key] = sourceValue;
  }

  return mergedConfig;
};

export const getNestedValue = (record: ConfigRecord, nestedPath: string): unknown => {
  let current: unknown = record;

  for (const key of nestedPath.split(".")) {
    if (current === undefined || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as ConfigRecord)[key];
  }

  return current;
};

export const setNestedValue = (record: ConfigRecord, nestedPath: string, value: unknown): void => {
  const pathSegments = nestedPath.split(".");
  const finalKey = pathSegments.pop();
  if (finalKey === undefined) return;

  let current: ConfigRecord = record;

  for (const segment of pathSegments) {
    const existingValue = current[segment];

    if (
      existingValue === undefined ||
      typeof existingValue !== "object" ||
      Array.isArray(existingValue)
    ) {
      current[segment] = {};
    }

    current = current[segment] as ConfigRecord;
  }

  current[finalKey] = value;
};
