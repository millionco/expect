export type Context = string | Record<string, unknown>;

export type SetupFn = string | ((page: import("playwright").Page) => Promise<void | string>);

export type BrowserName = "chrome" | "firefox" | "safari" | "edge" | "brave" | "arc";

export type CookieInput = true | BrowserName | BrowserName[] | Cookie[];

export type Test = string | { readonly title: string; readonly context?: Context };

export interface Cookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path?: string;
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  readonly sameSite?: "Strict" | "Lax" | "None";
  readonly expires?: number;
}
