/**
 * @deprecated ARCHIVED / DEAD CODE
 * Do not import, pattern-match on, or reference this code in new work.
 * Kept only as reference for browser SQLite decryption and cookie extraction logic.
 */

import path from "node:path";
import { Effect, Layer, Match, Option, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import { NodeServices } from "@effect/platform-node";
import getDefaultBrowser from "default-browser";
import {
  configByBundleId,
  configByDesktopFile,
  configByDisplayName,
  CHROMIUM_CONFIGS,
} from "./browser-config";
import { BrowserDetector, type DetectBrowserProfilesOptions } from "./browser-detector";
import { parseBinaryCookies } from "./utils/binary-cookies";
import { CdpClient } from "./cdp-client";
import { ChromiumExtractor } from "./chromium-extractor";
import { FirefoxExtractor } from "./firefox-extractor";
import { SafariExtractor } from "./safari-extractor";
import { CookieDatabaseNotFoundError, CookieReadError } from "./errors";
import { SqliteClient } from "./sqlite-client";
import { dedupeCookies, originsToHosts, stripLeadingDot } from "./utils/host-matching";
import { normalizeSameSite, parseFirefoxExpiry } from "./utils/normalize";
import { sqliteBool, stringField } from "./utils/sql-helpers";
import type {
  Browser,
  BrowserProfile,
  ChromiumBrowser,
  Cookie,
  ExtractOptions,
  ExtractProfileOptions,
} from "./types";

export class Cookies extends ServiceMap.Service<Cookies>()("@cookies/Cookies", {
  make: Effect.gen(function* () {
    const registerBrowser = (browser: Browser) => {};

    return {} as const;
  }),
}) {}
