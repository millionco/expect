import type { ChromiumBrowser } from "../types.js";

export const MAC_EPOCH_DELTA_SECONDS = 978_307_200;
export const BINARY_COOKIE_PAGE_HEADER = 0x00000100;

export const PBKDF2_SALT = "saltysalt";
export const PBKDF2_KEY_LENGTH_BYTES = 16;
export const PBKDF2_IV_FILL = 0x20;
export const PBKDF2_ITERATIONS_DARWIN = 1003;
export const PBKDF2_ITERATIONS_LINUX = 1;

export const CHROMIUM_META_VERSION_HASH_PREFIX = 24;

export const BINARY_COOKIE_MIN_HEADER_BYTES = 8;
export const BINARY_COOKIE_MIN_PAGE_BYTES = 16;
export const BINARY_COOKIE_MIN_RECORD_BYTES = 48;
export const BINARY_COOKIE_SECURE_FLAG = 0x1;
export const BINARY_COOKIE_HTTP_ONLY_FLAG = 0x4;
export const BINARY_COOKIE_FLAGS_OFFSET = 8;
export const BINARY_COOKIE_URL_OFFSET = 16;
export const BINARY_COOKIE_NAME_OFFSET = 20;
export const BINARY_COOKIE_PATH_OFFSET = 24;
export const BINARY_COOKIE_VALUE_OFFSET = 28;
export const BINARY_COOKIE_EXPIRATION_OFFSET = 40;

export const CHROMIUM_COOKIE_PREFIX_LENGTH_BYTES = 3;
export const AES_HASH_PREFIX_LENGTH_BYTES = 32;
export const GCM_NONCE_LENGTH_BYTES = 12;
export const GCM_TAG_LENGTH_BYTES = 16;
export const GCM_MIN_PAYLOAD_BYTES = 28;

export const DPAPI_PREFIX_LENGTH_BYTES = 5;

export const BINARY_COOKIE_MAGIC = "cook";
export const UINT32_SIZE_BYTES = 4;
export const DOUBLE_SIZE_BYTES = 8;

interface ChromiumSqliteConfig {
  cookiePaths: Record<string, string>;
  keychainService: string;
  linuxSecretLabel: string;
  localStatePath: string;
}

export const CHROMIUM_SQLITE_CONFIGS: Record<ChromiumBrowser, ChromiumSqliteConfig> = {
  chrome: {
    cookiePaths: {
      darwin: "Library/Application Support/Google/Chrome/Default",
      win32: "AppData/Local/Google/Chrome/User Data/Default",
      linux: ".config/google-chrome/Default",
    },
    keychainService: "Chrome Safe Storage",
    linuxSecretLabel: "chrome",
    localStatePath: "AppData/Local/Google/Chrome/User Data/Local State",
  },
  edge: {
    cookiePaths: {
      darwin: "Library/Application Support/Microsoft Edge/Default",
      win32: "AppData/Local/Microsoft/Edge/User Data/Default",
      linux: ".config/microsoft-edge/Default",
    },
    keychainService: "Microsoft Edge Safe Storage",
    linuxSecretLabel: "microsoft-edge",
    localStatePath: "AppData/Local/Microsoft/Edge/User Data/Local State",
  },
  brave: {
    cookiePaths: {
      darwin: "Library/Application Support/BraveSoftware/Brave-Browser/Default",
      win32: "AppData/Local/BraveSoftware/Brave-Browser/User Data/Default",
      linux: ".config/BraveSoftware/Brave-Browser/Default",
    },
    keychainService: "Brave Safe Storage",
    linuxSecretLabel: "brave",
    localStatePath: "AppData/Local/BraveSoftware/Brave-Browser/User Data/Local State",
  },
  arc: {
    cookiePaths: {
      darwin: "Library/Application Support/Arc/User Data/Default",
      win32: "AppData/Local/Arc/User Data/Default",
      linux: ".config/arc/Default",
    },
    keychainService: "Arc Safe Storage",
    linuxSecretLabel: "arc",
    localStatePath: "AppData/Local/Arc/User Data/Local State",
  },
  dia: {
    cookiePaths: {
      darwin: "Library/Application Support/Dia/User Data/Default",
      win32: "AppData/Local/Dia/User Data/Default",
      linux: ".config/dia/Default",
    },
    keychainService: "Dia Safe Storage",
    linuxSecretLabel: "dia",
    localStatePath: "AppData/Local/Dia/User Data/Local State",
  },
  helium: {
    cookiePaths: {
      darwin: "Library/Application Support/net.imput.helium/Default",
      win32: "AppData/Local/Helium/User Data/Default",
      linux: ".config/helium/Default",
    },
    keychainService: "Helium Storage Key",
    linuxSecretLabel: "helium",
    localStatePath: "AppData/Local/Helium/User Data/Local State",
  },
  chromium: {
    cookiePaths: {
      darwin: "Library/Application Support/Chromium/Default",
      win32: "AppData/Local/Chromium/User Data/Default",
      linux: ".config/chromium/Default",
    },
    keychainService: "Chromium Safe Storage",
    linuxSecretLabel: "chromium",
    localStatePath: "AppData/Local/Chromium/User Data/Local State",
  },
  vivaldi: {
    cookiePaths: {
      darwin: "Library/Application Support/Vivaldi/Default",
      win32: "AppData/Local/Vivaldi/User Data/Default",
      linux: ".config/vivaldi/Default",
    },
    keychainService: "Vivaldi Safe Storage",
    linuxSecretLabel: "vivaldi",
    localStatePath: "AppData/Local/Vivaldi/User Data/Local State",
  },
  opera: {
    cookiePaths: {
      darwin: "Library/Application Support/com.operasoftware.Opera",
      win32: "AppData/Roaming/Opera Software/Opera Stable",
      linux: ".config/opera",
    },
    keychainService: "Opera Safe Storage",
    linuxSecretLabel: "opera",
    localStatePath: "AppData/Roaming/Opera Software/Opera Stable/Local State",
  },
  ghost: {
    cookiePaths: {
      darwin: "Library/Application Support/Ghost Browser/Default",
      win32: "AppData/Local/Ghost Browser/User Data/Default",
      linux: ".config/ghost-browser/Default",
    },
    keychainService: "Ghost Browser Safe Storage",
    linuxSecretLabel: "ghost-browser",
    localStatePath: "AppData/Local/Ghost Browser/User Data/Local State",
  },
  sidekick: {
    cookiePaths: {
      darwin: "Library/Application Support/Sidekick/Default",
      win32: "AppData/Local/Sidekick/User Data/Default",
      linux: ".config/sidekick/Default",
    },
    keychainService: "Sidekick Safe Storage",
    linuxSecretLabel: "sidekick",
    localStatePath: "AppData/Local/Sidekick/User Data/Local State",
  },
  yandex: {
    cookiePaths: {
      darwin: "Library/Application Support/YandexBrowser/Default",
      win32: "AppData/Local/Yandex/YandexBrowser/User Data/Default",
      linux: ".config/yandex-browser/Default",
    },
    keychainService: "Yandex Safe Storage",
    linuxSecretLabel: "yandex-browser",
    localStatePath: "AppData/Local/Yandex/YandexBrowser/User Data/Local State",
  },
  iridium: {
    cookiePaths: {
      darwin: "Library/Application Support/Iridium/Default",
      win32: "AppData/Local/Iridium/User Data/Default",
      linux: ".config/iridium/Default",
    },
    keychainService: "Iridium Safe Storage",
    linuxSecretLabel: "iridium",
    localStatePath: "AppData/Local/Iridium/User Data/Local State",
  },
  thorium: {
    cookiePaths: {
      darwin: "Library/Application Support/Thorium/Default",
      win32: "AppData/Local/Thorium/User Data/Default",
      linux: ".config/thorium/Default",
    },
    keychainService: "Thorium Safe Storage",
    linuxSecretLabel: "thorium",
    localStatePath: "AppData/Local/Thorium/User Data/Local State",
  },
  sigmaos: {
    cookiePaths: {
      darwin: "Library/Application Support/SigmaOS/Default",
      win32: "AppData/Local/SigmaOS/User Data/Default",
      linux: ".config/sigmaos/Default",
    },
    keychainService: "SigmaOS Safe Storage",
    linuxSecretLabel: "sigmaos",
    localStatePath: "AppData/Local/SigmaOS/User Data/Local State",
  },
  wavebox: {
    cookiePaths: {
      darwin: "Library/Application Support/Wavebox/Default",
      win32: "AppData/Local/Wavebox/User Data/Default",
      linux: ".config/wavebox/Default",
    },
    keychainService: "Wavebox Safe Storage",
    linuxSecretLabel: "wavebox",
    localStatePath: "AppData/Local/Wavebox/User Data/Local State",
  },
  comet: {
    cookiePaths: {
      darwin: "Library/Application Support/Comet/Default",
      win32: "AppData/Local/Comet/User Data/Default",
      linux: ".config/comet/Default",
    },
    keychainService: "Comet Safe Storage",
    linuxSecretLabel: "comet",
    localStatePath: "AppData/Local/Comet/User Data/Local State",
  },
  blisk: {
    cookiePaths: {
      darwin: "Library/Application Support/Blisk/Default",
      win32: "AppData/Local/Blisk/User Data/Default",
      linux: ".config/blisk/Default",
    },
    keychainService: "Blisk Safe Storage",
    linuxSecretLabel: "blisk",
    localStatePath: "AppData/Local/Blisk/User Data/Local State",
  },
};
