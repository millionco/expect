import type { ExpectConfig } from "./types";

let globalConfig: ExpectConfig = {};

export const defineConfig = (config: ExpectConfig): ExpectConfig => config;

export const configure = (config: Partial<ExpectConfig>): void => {
  globalConfig = { ...globalConfig, ...config };
};

export const getGlobalConfig = (): ExpectConfig => globalConfig;

export const resetGlobalConfig = (): void => {
  globalConfig = {};
};
