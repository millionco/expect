import type { ExpectConfig } from "./types";

let globalConfig: Partial<ExpectConfig> = {};

/**
 * Define a complete Expect configuration. Use in `expect.config.ts`.
 *
 * @example
 * ```ts
 * // expect.config.ts
 * import { defineConfig } from "expect";
 *
 * export default defineConfig({
 *   baseUrl: "http://localhost:3000",
 *   browser: "chromium",
 *   isHeadless: true,
 *   cookies: "chrome",
 * });
 * ```
 */
export const defineConfig = (config: ExpectConfig): ExpectConfig => config;

/**
 * Set configuration inline without a config file. Merges with existing config.
 *
 * @example
 * ```ts
 * import { configure, expect } from "expect";
 *
 * configure({ baseUrl: "http://localhost:3000" });
 *
 * await expect("/login").toPass(["login works"]);
 * ```
 */
export const configure = (config: Partial<ExpectConfig>): void => {
  globalConfig = { ...globalConfig, ...config };
};

export const getGlobalConfig = (): Partial<ExpectConfig> => globalConfig;

export const resetGlobalConfig = (): void => {
  globalConfig = {};
};
