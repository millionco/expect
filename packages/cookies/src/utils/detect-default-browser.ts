import getDefaultBrowser from "default-browser";
import { BUNDLE_ID_TO_BROWSER, DESKTOP_FILE_TO_BROWSER } from "../constants.js";
import type { Browser } from "../types.js";

const resolveIdToBrowser = (identifier: string): Browser | null => {
  const normalizedId = identifier.toLowerCase();
  const desktopKey = normalizedId.replace(/\.desktop$/, "");

  return BUNDLE_ID_TO_BROWSER[normalizedId] ?? DESKTOP_FILE_TO_BROWSER[desktopKey] ?? null;
};

export const detectDefaultBrowser = async (): Promise<Browser | null> => {
  try {
    const result = await getDefaultBrowser();
    return resolveIdToBrowser(result.id);
  } catch {
    return null;
  }
};
