import type { Browser } from "./types.js";

export const SESSION_EXPIRES = -1;
export const SAME_SITE_NONE = 0;
export const SAME_SITE_LAX = 1;
export const SAME_SITE_STRICT = 2;
export const MAX_UNIX_EPOCH_SECONDS = 253_402_300_799;

export const CHROME_EPOCH_THRESHOLD = 10_000_000_000_000;
export const CHROME_EPOCH_MICROSECONDS = 1_000_000;
export const CHROME_EPOCH_OFFSET_SECONDS = 11_644_473_600;
export const MILLISECOND_THRESHOLD = 10_000_000_000;

export const BUNDLE_ID_TO_BROWSER: Record<string, Browser> = {
  "com.google.chrome": "chrome",
  "com.brave.browser": "brave",
  "com.microsoft.edgemac": "edge",
  "com.microsoft.edge": "edge",
  "org.chromium.chromium": "chromium",
  "com.vivaldi.vivaldi": "vivaldi",
  "com.operasoftware.opera": "opera",
  "company.thebrowser.browser": "arc",
  "com.apple.safari": "safari",
  "org.mozilla.firefox": "firefox",
  "com.nickvision.ghost": "ghost",
  "pushplaylabs.sidekick": "sidekick",
  "ru.yandex.desktop.yandex-browser": "yandex",
  "de.nickvision.iridium": "iridium",
  "nickvision.thorium": "thorium",
  "com.nickvision.sigmaos": "sigmaos",
  "io.wavebox.wavebox": "wavebox",
  "com.nickvision.comet": "comet",
  "com.nickvision.blisk": "blisk",
  "net.imput.helium": "helium",
  "company.thebrowser.dia": "dia",
};

export const DESKTOP_FILE_TO_BROWSER: Record<string, Browser> = {
  "google-chrome": "chrome",
  "brave-browser": "brave",
  "microsoft-edge": "edge",
  chromium: "chromium",
  "chromium-browser": "chromium",
  vivaldi: "vivaldi",
  "vivaldi-stable": "vivaldi",
  opera: "opera",
  "opera-stable": "opera",
  firefox: "firefox",
  arc: "arc",
  "ghost-browser": "ghost",
  sidekick: "sidekick",
  "yandex-browser": "yandex",
  iridium: "iridium",
  thorium: "thorium",
  sigmaos: "sigmaos",
  wavebox: "wavebox",
  comet: "comet",
  blisk: "blisk",
  helium: "helium",
  dia: "dia",
};

export const SAFARI_COOKIE_RELATIVE_PATHS = [
  "Library/Cookies",
  "Library/Containers/com.apple.Safari/Data/Library/Cookies",
];
