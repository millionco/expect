import { describe, expect, it } from "vite-plus/test";

import { parseBinaryCookies } from "../src/utils/binary-cookies.js";

const buildBinaryCookies = (
  cookies: Array<{
    name: string;
    value: string;
    url: string;
    path: string;
    expiration: number;
    flags: number;
  }>,
): Buffer => {
  const cookieBuffers: Buffer[] = [];

  for (const cookie of cookies) {
    const urlBuffer = Buffer.from(`${cookie.url}\0`);
    const nameBuffer = Buffer.from(`${cookie.name}\0`);
    const pathBuffer = Buffer.from(`${cookie.path}\0`);
    const valueBuffer = Buffer.from(`${cookie.value}\0`);

    const headerSize = 48;
    const urlOffset = headerSize;
    const nameOffset = urlOffset + urlBuffer.length;
    const pathOffset = nameOffset + nameBuffer.length;
    const valueOffset = pathOffset + pathBuffer.length;
    const totalSize = valueOffset + valueBuffer.length;

    const record = Buffer.alloc(totalSize);
    record.writeUInt32LE(totalSize, 0);
    record.writeUInt32LE(cookie.flags, 8);
    record.writeUInt32LE(urlOffset, 16);
    record.writeUInt32LE(nameOffset, 20);
    record.writeUInt32LE(pathOffset, 24);
    record.writeUInt32LE(valueOffset, 28);
    record.writeDoubleLE(cookie.expiration, 40);

    urlBuffer.copy(record, urlOffset);
    nameBuffer.copy(record, nameOffset);
    pathBuffer.copy(record, pathOffset);
    valueBuffer.copy(record, valueOffset);

    cookieBuffers.push(record);
  }

  const offsetTableSize = cookieBuffers.length * 4;
  const pageHeaderSize = 8;
  const offsetsStart = pageHeaderSize;

  let dataOffset = offsetsStart + offsetTableSize;
  const offsets: number[] = [];
  for (const record of cookieBuffers) {
    offsets.push(dataOffset);
    dataOffset += record.length;
  }

  const pageSize = dataOffset;
  const page = Buffer.alloc(pageSize);
  page.writeUInt32BE(0x00000100, 0);
  page.writeUInt32LE(cookieBuffers.length, 4);

  let offsetCursor = offsetsStart;
  for (const offset of offsets) {
    page.writeUInt32LE(offset, offsetCursor);
    offsetCursor += 4;
  }

  let dataCursor = offsetsStart + offsetTableSize;
  for (const record of cookieBuffers) {
    record.copy(page, dataCursor);
    dataCursor += record.length;
  }

  const fileHeaderSize = 8;
  const pageSizesSize = 4;
  const totalFileSize = fileHeaderSize + pageSizesSize + pageSize;
  const file = Buffer.alloc(totalFileSize);

  file.write("cook", 0, 4, "utf8");
  file.writeUInt32BE(1, 4);
  file.writeUInt32BE(pageSize, 8);
  page.copy(file, 12);

  return file;
};

describe("parseBinaryCookies", () => {
  it("returns empty array for empty buffer", () => {
    expect(parseBinaryCookies(Buffer.alloc(0))).toEqual([]);
  });

  it("returns empty array for wrong magic", () => {
    const buffer = Buffer.alloc(8);
    buffer.write("nope", 0, 4, "utf8");
    expect(parseBinaryCookies(buffer)).toEqual([]);
  });

  it("parses a single cookie", () => {
    const macEpochExpiry = 700_000_000;
    const binary = buildBinaryCookies([
      {
        name: "session",
        value: "abc123",
        url: ".example.com",
        path: "/",
        expiration: macEpochExpiry,
        flags: 0,
      },
    ]);

    const cookies = parseBinaryCookies(binary);
    expect(cookies).toHaveLength(1);
    expect(cookies[0].name).toBe("session");
    expect(cookies[0].value).toBe("abc123");
    expect(cookies[0].domain).toBe("example.com");
  });

  it("parses secure and httpOnly flags", () => {
    const binary = buildBinaryCookies([
      {
        name: "s",
        value: "v",
        url: "example.com",
        path: "/",
        expiration: 700_000_000,
        flags: 1 | 4,
      },
    ]);
    const cookies = parseBinaryCookies(binary);
    expect(cookies[0].secure).toBe(true);
    expect(cookies[0].httpOnly).toBe(true);
  });

  it("parses multiple cookies", () => {
    const binary = buildBinaryCookies([
      { name: "a", value: "1", url: "example.com", path: "/", expiration: 700_000_000, flags: 0 },
      { name: "b", value: "2", url: "other.com", path: "/api", expiration: 800_000_000, flags: 1 },
    ]);

    const cookies = parseBinaryCookies(binary);
    expect(cookies).toHaveLength(2);
    expect(cookies[0].name).toBe("a");
    expect(cookies[1].name).toBe("b");
  });

  it("handles zero expiration as undefined", () => {
    const binary = buildBinaryCookies([
      { name: "session", value: "val", url: "example.com", path: "/", expiration: 0, flags: 0 },
    ]);
    expect(parseBinaryCookies(binary)[0].expires).toBeUndefined();
  });
});
