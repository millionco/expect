import { Order, Schema, SchemaGetter } from "effect";

export const SameSitePolicy = Schema.Literals(["Strict", "Lax", "None"] as const);
export type SameSitePolicy = typeof SameSitePolicy.Type;

export const BrowserKey = Schema.Literals([
  "chrome",
  "edge",
  "brave",
  "arc",
  "dia",
  "helium",
  "chromium",
  "vivaldi",
  "opera",
  "ghost",
  "sidekick",
  "yandex",
  "iridium",
  "thorium",
  "sigmaos",
  "wavebox",
  "comet",
  "blisk",
  "firefox",
  "safari",
] as const);
export type BrowserKey = typeof BrowserKey.Type;

export const ChromiumBrowserKey = Schema.Literals([
  "chrome",
  "edge",
  "brave",
  "arc",
  "dia",
  "helium",
  "chromium",
  "vivaldi",
  "opera",
  "ghost",
  "sidekick",
  "yandex",
  "iridium",
  "thorium",
  "sigmaos",
  "wavebox",
  "comet",
  "blisk",
] as const);
export type ChromiumBrowserKey = typeof ChromiumBrowserKey.Type;

const DotlessDomain = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transform((domain) => (domain.startsWith(".") ? domain.slice(1) : domain)),
    encode: SchemaGetter.transform((domain) => domain),
  }),
);

export class Cookie extends Schema.Class<Cookie>("@cookies/Cookie")({
  name: Schema.String,
  value: Schema.String,
  domain: DotlessDomain,
  path: Schema.String,
  expires: Schema.optional(
    Schema.Number.pipe(
      Schema.decodeTo(Schema.Number, {
        decode: SchemaGetter.transform((value) => Math.floor(value)),
        encode: SchemaGetter.transform((value) => value),
      }),
    ),
  ),
  secure: Schema.Boolean,
  httpOnly: Schema.Boolean,
  sameSite: Schema.optional(SameSitePolicy),
}) {
  static make = Schema.decodeUnknownSync(this);

  get playwrightFormat() {
    const SESSION_EXPIRES = -1;
    const domain = this.name.startsWith("__Host-")
      ? this.domain
      : this.domain.startsWith(".")
        ? this.domain
        : `.${this.domain}`;

    return {
      name: this.name,
      value: this.value,
      domain,
      path: this.path,
      expires: this.expires ?? SESSION_EXPIRES,
      secure: this.secure,
      httpOnly: this.httpOnly,
      ...(this.sameSite !== undefined && { sameSite: this.sameSite }),
    };
  }
}

export class ChromiumBrowser extends Schema.Class<ChromiumBrowser>("@cookies/ChromiumBrowser")({
  _tag: Schema.tag("ChromiumBrowser"),
  key: ChromiumBrowserKey,
  profileName: Schema.String,
  profilePath: Schema.String,
  executablePath: Schema.String,
  locale: Schema.optional(Schema.String),
}) {
  static orderBy = (lastUsedProfileName: string | undefined) =>
    Order.combine(
      Order.mapInput(
        Order.Boolean,
        (profile: ChromiumBrowser) => profile.profileName === lastUsedProfileName,
      ),
      Order.mapInput(
        Order.make(
          (left: string, right: string) =>
            left.localeCompare(right, undefined, { numeric: true }) as -1 | 0 | 1,
        ),
        (profile: ChromiumBrowser) => profile.profileName,
      ),
    );
}

export class FirefoxBrowser extends Schema.Class<FirefoxBrowser>("@cookies/FirefoxBrowser")({
  _tag: Schema.tag("FirefoxBrowser"),
  profileName: Schema.String,
  profilePath: Schema.String,
}) {}

export class SafariBrowser extends Schema.Class<SafariBrowser>("@cookies/SafariBrowser")({
  _tag: Schema.tag("SafariBrowser"),
  cookieFilePath: Schema.OptionFromNullishOr(Schema.String),
}) {}

export const Browser = Schema.Union([ChromiumBrowser, FirefoxBrowser, SafariBrowser]);
export type Browser = typeof Browser.Type;

export interface ExtractOptions {
  url: string;
  browsers?: BrowserKey[];
  names?: string[];
  includeExpired?: boolean;
}

export const browserKeyOf = (browser: Browser): BrowserKey => {
  if (browser._tag === "ChromiumBrowser") return browser.key;
  if (browser._tag === "FirefoxBrowser") return "firefox";
  return "safari";
};
