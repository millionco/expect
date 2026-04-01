import { Cause, Schema } from "effect";

export class CookieDatabaseNotFoundError extends Schema.ErrorClass<CookieDatabaseNotFoundError>(
  "CookieDatabaseNotFoundError",
)({
  _tag: Schema.tag("CookieDatabaseNotFoundError"),
  browser: Schema.String,
}) {
  message = `Cookie database not found for ${this.browser}`;
}

export class CpdInvalidResponsePayload extends Schema.ErrorClass<CpdInvalidResponsePayload>(
  "CpdInvalidResponsePayload",
)({
  _tag: Schema.tag("CpdInvalidResponsePayload"),
  code: Schema.Number,
  errorMessage: Schema.String,
}) {
  message = `Network.getAllCookies responded with #${this.code}: ${this.errorMessage}`;
}

export class DebuggerUrlNotFoundError extends Schema.ErrorClass<DebuggerUrlNotFoundError>(
  "DebuggerUrlNotFoundError",
)({
  _tag: Schema.tag("DebuggerUrlNotFoundError"),
}) {
  message = `Debugger URL not found`;
}

export class UnknownError extends Schema.ErrorClass<UnknownError>("UnknownError")({
  _tag: Schema.tag("UnknownError"),
  cause: Schema.Unknown,
}) {
  message = `An unexpected error occurred. ${
    Cause.isCause(this.cause) ? Cause.pretty(this.cause) : String(this.cause)
  }`;
}

export class RequiresFullDiskAccess extends Schema.ErrorClass<RequiresFullDiskAccess>(
  "RequiresFullDiskAccess",
)({
  _tag: Schema.tag("RequiresFullDiskAccess"),
}) {
  message = `Safari cookie extraction requires Full Disk Access`;
}

export class ExtractionError extends Schema.ErrorClass<ExtractionError>("ExtractionError")({
  _tag: Schema.tag("ExtractionError"),
  reason: Schema.Union([
    CpdInvalidResponsePayload,
    DebuggerUrlNotFoundError,
    RequiresFullDiskAccess,
    UnknownError,
  ]),
}) {
  message = `Extracting cookies failed. Error: ${this.reason.message}`;
}

export class CookieDatabaseCopyError extends Schema.ErrorClass<CookieDatabaseCopyError>(
  "CookieDatabaseCopyError",
)({
  _tag: Schema.tag("CookieDatabaseCopyError"),
  browser: Schema.String,
  databasePath: Schema.String,
  cause: Schema.String,
}) {
  message = `Failed to copy cookie database for ${this.browser}: ${this.cause}`;
}

export class CookieDecryptionKeyError extends Schema.ErrorClass<CookieDecryptionKeyError>(
  "CookieDecryptionKeyError",
)({
  _tag: Schema.tag("CookieDecryptionKeyError"),
  browser: Schema.String,
  platform: Schema.String,
}) {
  message = `Decryption key not found for ${this.browser} on ${this.platform}`;
}

export class CookieReadError extends Schema.ErrorClass<CookieReadError>("CookieReadError")({
  _tag: Schema.tag("CookieReadError"),
  browser: Schema.String,
  cause: Schema.String,
}) {
  message = `Failed to read cookies for ${this.browser}: ${this.cause}`;
}

export class CdpConnectionError extends Schema.ErrorClass<CdpConnectionError>("CdpConnectionError")(
  {
    _tag: Schema.tag("CdpConnectionError"),
    port: Schema.Number,
    cause: Schema.String,
  },
) {
  message = `CDP connection failed on port ${this.port}: ${this.cause}`;
}

export class BrowserSpawnError extends Schema.ErrorClass<BrowserSpawnError>("BrowserSpawnError")({
  _tag: Schema.tag("BrowserSpawnError"),
  executablePath: Schema.String,
  cause: Schema.String,
}) {
  message = `Failed to spawn browser at ${this.executablePath}: ${this.cause}`;
}

export class UnsupportedPlatformError extends Schema.ErrorClass<UnsupportedPlatformError>(
  "UnsupportedPlatformError",
)({
  _tag: Schema.tag("UnsupportedPlatformError"),
  platform: Schema.String,
}) {
  message = `Unsupported platform: ${this.platform}`;
}

export class UnsupportedBrowserError extends Schema.ErrorClass<UnsupportedBrowserError>(
  "UnsupportedBrowserError",
)({
  _tag: Schema.tag("UnsupportedBrowserError"),
  browser: Schema.String,
}) {
  message = `Unsupported browser: ${this.browser}`;
}

export class ListBrowsersError extends Schema.ErrorClass<ListBrowsersError>("ListBrowsersError")({
  _tag: Schema.tag("ListBrowsersError"),
  cause: Schema.String,
}) {
  message = `Failed to list browsers: ${this.cause}`;
}
