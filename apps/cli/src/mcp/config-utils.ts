import { Predicate } from "effect";
import { ConfigRecord } from "./config-types";

export const isConfigRecord = (value: unknown): value is ConfigRecord =>
  Predicate.isObject(value) && !Array.isArray(value);

export const deepMerge = (target: ConfigRecord, source: ConfigRecord): ConfigRecord => {
  const mergedConfig: ConfigRecord = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = mergedConfig[key];

    if (isConfigRecord(sourceValue)) {
      mergedConfig[key] = deepMerge(isConfigRecord(targetValue) ? targetValue : {}, sourceValue);
      continue;
    }

    mergedConfig[key] = sourceValue;
  }

  return mergedConfig;
};

export const getNestedValue = (record: ConfigRecord, nestedPath: string): unknown => {
  let current: unknown = record;

  for (const key of nestedPath.split(".")) {
    if (!isConfigRecord(current)) {
      return undefined;
    }

    current = current[key];
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

    if (!isConfigRecord(existingValue)) {
      current[segment] = {};
    }

    current = current[segment] as ConfigRecord;
  }

  current[finalKey] = value;
};
