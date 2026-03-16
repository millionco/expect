import type { Locator, Page } from "playwright";
import type { AriaRole, RefEntry } from "../types";

// HACK: role is `string` throughout the ref system because it comes from Playwright's
// aria snapshot output. This is the only place we narrow it back for `getByRole`.
export const resolveLocator = (page: Page, entry: RefEntry): Locator => {
  if (entry.selector) return page.locator(entry.selector);
  const locator = page.getByRole(entry.role as AriaRole, { name: entry.name, exact: true });
  return entry.nth !== undefined ? locator.nth(entry.nth) : locator;
};
