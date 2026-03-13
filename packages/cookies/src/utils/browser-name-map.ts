import type { Browser } from "../types.js";

const DISPLAY_NAME_TO_BROWSER: Record<string, Browser> = {
  "Google Chrome": "chrome",
  "Brave Browser": "brave",
  "Microsoft Edge": "edge",
  Chromium: "chromium",
  Vivaldi: "vivaldi",
  Opera: "opera",
  Arc: "arc",
  "Ghost Browser": "ghost",
  Sidekick: "sidekick",
  Yandex: "yandex",
  Iridium: "iridium",
  Thorium: "thorium",
  SigmaOS: "sigmaos",
  Wavebox: "wavebox",
  Comet: "comet",
  Blisk: "blisk",
  Helium: "helium",
  Dia: "dia",
  Firefox: "firefox",
  Safari: "safari",
};

export const browserDisplayNameToKey = (displayName: string): Browser | undefined =>
  DISPLAY_NAME_TO_BROWSER[displayName];
