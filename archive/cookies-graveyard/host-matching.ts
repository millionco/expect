/**
 * @deprecated ARCHIVED / DEAD CODE
 * Do not import, pattern-match on, or reference this code in new work.
 * Kept only as reference for browser SQLite decryption and cookie extraction logic.
 */

import type { Cookie } from "../types";

export const stripLeadingDot = (domain: string): string =>
  domain.startsWith(".") ? domain.slice(1) : domain;

export const hostMatchesCookieDomain = (host: string, cookieDomain: string): boolean => {
  const normalizedHost = host.toLowerCase();
  const domainLower = stripLeadingDot(cookieDomain).toLowerCase();
  return normalizedHost === domainLower || normalizedHost.endsWith(`.${domainLower}`);
};

export const hostMatchesAny = (hosts: string[], cookieDomain: string): boolean =>
  hosts.some((host) => hostMatchesCookieDomain(host, cookieDomain));

export const originsToHosts = (origins: string[]): string[] =>
  origins.map((origin) => {
    try {
      return new URL(origin).hostname;
    } catch {
      return new URL(`https://${origin}`).hostname;
    }
  });

export const dedupeCookies = (cookies: Cookie[]): Cookie[] => {
  const merged = new Map<string, Cookie>();
  for (const cookie of cookies) {
    const key = `${cookie.name}|${cookie.domain}|${cookie.path}`;
    if (!merged.has(key)) merged.set(key, cookie);
  }
  return Array.from(merged.values());
};

export const toCookieHeader = (cookies: Cookie[]): string =>
  cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
