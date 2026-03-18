import { Cookie } from "../types";

const MAC_EPOCH_DELTA_SECONDS = 978_307_200;
const BINARY_COOKIE_PAGE_HEADER = 0x00000100;
const BINARY_COOKIE_MAGIC = "cook";
const UINT32_SIZE_BYTES = 4;
const DOUBLE_SIZE_BYTES = 8;
const BINARY_COOKIE_MIN_HEADER_BYTES = 8;
const BINARY_COOKIE_MIN_PAGE_BYTES = 16;
const BINARY_COOKIE_MIN_RECORD_BYTES = 48;
const BINARY_COOKIE_SECURE_FLAG = 0x1;
const BINARY_COOKIE_HTTP_ONLY_FLAG = 0x4;
const BINARY_COOKIE_FLAGS_OFFSET = 8;
const BINARY_COOKIE_URL_OFFSET = 16;
const BINARY_COOKIE_NAME_OFFSET = 20;
const BINARY_COOKIE_PATH_OFFSET = 24;
const BINARY_COOKIE_VALUE_OFFSET = 28;
const BINARY_COOKIE_EXPIRATION_OFFSET = 40;

export const parseBinaryCookies = (buffer: Buffer): Cookie[] => {
  if (buffer.length < BINARY_COOKIE_MIN_HEADER_BYTES) return [];
  if (buffer.subarray(0, UINT32_SIZE_BYTES).toString("utf8") !== BINARY_COOKIE_MAGIC) return [];

  const pageCount = buffer.readUInt32BE(UINT32_SIZE_BYTES);
  let cursor = BINARY_COOKIE_MIN_HEADER_BYTES;
  const pageSizes: number[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    pageSizes.push(buffer.readUInt32BE(cursor));
    cursor += UINT32_SIZE_BYTES;
  }

  const cookies: Cookie[] = [];
  for (const pageSize of pageSizes) {
    const page = buffer.subarray(cursor, cursor + pageSize);
    cursor += pageSize;
    cookies.push(...decodePage(page));
  }
  return cookies;
};

const decodePage = (page: Buffer): Cookie[] => {
  if (page.length < BINARY_COOKIE_MIN_PAGE_BYTES) return [];

  const header = page.readUInt32BE(0);
  if (header !== BINARY_COOKIE_PAGE_HEADER) return [];

  const cookieCount = page.readUInt32LE(UINT32_SIZE_BYTES);
  const offsets: number[] = [];
  let cursor = BINARY_COOKIE_MIN_HEADER_BYTES;

  for (let index = 0; index < cookieCount; index += 1) {
    offsets.push(page.readUInt32LE(cursor));
    cursor += UINT32_SIZE_BYTES;
  }

  const cookies: Cookie[] = [];
  for (const offset of offsets) {
    const cookie = decodeCookieRecord(page.subarray(offset));
    if (cookie) cookies.push(cookie);
  }
  return cookies;
};

const decodeCookieRecord = (record: Buffer): Cookie | undefined => {
  if (record.length < BINARY_COOKIE_MIN_RECORD_BYTES) return undefined;

  const size = record.readUInt32LE(0);
  if (size < BINARY_COOKIE_MIN_RECORD_BYTES || size > record.length) return undefined;

  const flags = record.readUInt32LE(BINARY_COOKIE_FLAGS_OFFSET);
  const isSecure = (flags & BINARY_COOKIE_SECURE_FLAG) !== 0;
  const isHttpOnly = (flags & BINARY_COOKIE_HTTP_ONLY_FLAG) !== 0;

  const urlOffset = record.readUInt32LE(BINARY_COOKIE_URL_OFFSET);
  const nameOffset = record.readUInt32LE(BINARY_COOKIE_NAME_OFFSET);
  const pathOffset = record.readUInt32LE(BINARY_COOKIE_PATH_OFFSET);
  const valueOffset = record.readUInt32LE(BINARY_COOKIE_VALUE_OFFSET);

  const expiration = readDoubleLE(record, BINARY_COOKIE_EXPIRATION_OFFSET);

  const rawUrl = readCString(record, urlOffset, size);
  const name = readCString(record, nameOffset, size);
  const cookiePath = readCString(record, pathOffset, size) ?? "/";
  const value = readCString(record, valueOffset, size) ?? "";

  if (!name) return undefined;

  const domain = rawUrl ? safeHostname(rawUrl) : undefined;
  const expires =
    expiration && expiration > 0 ? Math.round(expiration + MAC_EPOCH_DELTA_SECONDS) : undefined;

  return Cookie.make({
    name,
    value,
    domain: domain ?? "",
    path: cookiePath,
    expires,
    secure: isSecure,
    httpOnly: isHttpOnly,
  });
};

const readDoubleLE = (buffer: Buffer, offset: number): number => {
  if (offset + DOUBLE_SIZE_BYTES > buffer.length) return 0;
  return buffer.subarray(offset, offset + DOUBLE_SIZE_BYTES).readDoubleLE(0);
};

const readCString = (buffer: Buffer, offset: number, end: number): string | undefined => {
  if (offset <= 0 || offset >= end) return undefined;

  let cursor = offset;
  while (cursor < end && buffer[cursor] !== 0) {
    cursor += 1;
  }
  if (cursor >= end) return undefined;
  return buffer.toString("utf8", offset, cursor);
};

const safeHostname = (raw: string): string | undefined => {
  try {
    const url = raw.includes("://") ? raw : `https://${raw}`;
    return new URL(url).hostname;
  } catch {
    const cleaned = raw.trim();
    if (cleaned === "") return undefined;
    return cleaned;
  }
};
