/**
 * @deprecated ARCHIVED / DEAD CODE
 * Do not import, pattern-match on, or reference this code in new work.
 * Kept only as reference for browser SQLite decryption and cookie extraction logic.
 */

import { getEpochSeconds } from "@browser-tester/utils";
import { hostMatchesCookieDomain, toCookieHeader } from "./host-matching";
import type { Cookie, SameSitePolicy } from "../types";

const SESSION_EXPIRES = -1;

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: SameSitePolicy;
}

export type PlaywrightCookie = BrowserCookie;
export type PuppeteerCookie = BrowserCookie;

const ensureDotPrefix = (domain: string): string =>
  domain.startsWith(".") ? domain : `.${domain}`;

const resolveCookieDomain = (cookie: Cookie): string =>
  cookie.name.startsWith("__Host-")
    ? cookie.domain.replace(/^\./, "")
    : ensureDotPrefix(cookie.domain);

const toBaseCookie = (cookie: Cookie) => ({
  name: cookie.name,
  value: cookie.value,
  domain: resolveCookieDomain(cookie),
  path: cookie.path,
  expires: cookie.expires ?? SESSION_EXPIRES,
  secure: cookie.secure,
  httpOnly: cookie.httpOnly,
});

export const matchCookies = (cookies: Cookie[], url: string): Cookie[] => {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const pathname = parsed.pathname || "/";
  const currentTime = getEpochSeconds();

  return cookies.filter((cookie) => {
    if (!hostMatchesCookieDomain(host, cookie.domain)) return false;
    if (!pathname.startsWith(cookie.path)) return false;
    if (cookie.secure && parsed.protocol !== "https:") return false;
    if (cookie.expires && cookie.expires < currentTime) return false;
    return true;
  });
};

export const matchCookieHeader = (cookies: Cookie[], url: string): string =>
  toCookieHeader(matchCookies(cookies, url));

const toBrowserCookies = (cookies: Cookie[]): BrowserCookie[] =>
  cookies.map((cookie) => ({
    ...toBaseCookie(cookie),
    sameSite: cookie.sameSite,
  }));

export const toPlaywrightCookies = toBrowserCookies;
export const toPuppeteerCookies = toBrowserCookies;
