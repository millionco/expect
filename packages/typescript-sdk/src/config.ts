import type { ExpectConfig } from "./types";

let globalConfig: ExpectConfig = {};

export const configure = (config: Partial<ExpectConfig>): void => {
  globalConfig = { ...globalConfig, ...config };
};

export const getGlobalConfig = (): ExpectConfig => globalConfig;
