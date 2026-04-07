import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
// @ts-expect-error node:sqlite lacks type declarations
import * as sqlite from "node:sqlite";
import { assert, describe, it } from "vite-plus/test";
import { Effect, Layer, Option } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { Cookies } from "../src/cookies";
import { BROWSER_CONFIGS } from "../src/browser-config";
import { parseBinaryCookies } from "../src/utils/binary-cookies";
import { FirefoxBrowser, SafariBrowser } from "../src/types";

const CookiesTestRuntime = Layer.merge(Cookies.layerTest, NodeServices.layer);

describe("BROWSER_CONFIGS", () => {
  it("contains all expected browsers", () => {
    const keys = BROWSER_CONFIGS.map((config) => config.key);
    assert.include(keys, "chrome");
    assert.include(keys, "firefox");
    assert.include(keys, "safari");
    assert.include(keys, "edge");
    assert.include(keys, "brave");
    assert.include(keys, "arc");
  });

  it("has unique keys", () => {
    const keys = BROWSER_CONFIGS.map((config) => config.key);
    assert.strictEqual(keys.length, new Set(keys).size);
  });

  it("has unique display names", () => {
    const names = BROWSER_CONFIGS.map((config) => config.displayName);
    assert.strictEqual(names.length, new Set(names).size);
  });
});

const seedFirefoxCookiesDb = (dbPath: string) => {
  const database = new sqlite.DatabaseSync(dbPath);
  database.exec(
    `CREATE TABLE moz_cookies (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      host TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '/',
      expiry INTEGER NOT NULL DEFAULT 0,
      isSecure INTEGER NOT NULL DEFAULT 0,
      isHttpOnly INTEGER NOT NULL DEFAULT 0,
      sameSite INTEGER NOT NULL DEFAULT 0
    )`,
  );
  const insert = database.prepare(
    "INSERT INTO moz_cookies (name, value, host, path, expiry, isSecure, isHttpOnly, sameSite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run("session_id", "abc123", ".example.com", "/", 9999999999, 1, 0, 1);
  insert.run("preference", "dark", "other.com", "/settings", 9999999999, 0, 1, 2);
  database.close();
};

const MAC_EPOCH_DELTA_SECONDS = 978_307_200;

const buildBinaryCookiesFile = (
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

describe("Cookies.extract (Firefox)", () => {
  it("extracts cookies from a Firefox profile database", () =>
    Effect.gen(function* () {
      const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "firefox-profile-test-"));

      try {
        seedFirefoxCookiesDb(path.join(profileDir, "cookies.sqlite"));

        const cookies = yield* Cookies;
        const firefoxBrowser = new FirefoxBrowser({
          profileName: "test-profile",
          profilePath: profileDir,
        });
        const result = yield* cookies.extract(firefoxBrowser);

        assert.isArray(result);
        assert.strictEqual(result.length, 2);

        const session = result.find((cookie) => cookie.name === "session_id");
        assert.isDefined(session);
        assert.strictEqual(session!.value, "abc123");
        assert.strictEqual(session!.domain, "example.com");
        assert.strictEqual(session!.path, "/");
        assert.isTrue(session!.secure);
        assert.isFalse(session!.httpOnly);
        assert.strictEqual(session!.sameSite, "Lax");

        const preference = result.find((cookie) => cookie.name === "preference");
        assert.isDefined(preference);
        assert.strictEqual(preference!.value, "dark");
        assert.strictEqual(preference!.domain, "other.com");
        assert.strictEqual(preference!.path, "/settings");
        assert.isFalse(preference!.secure);
        assert.isTrue(preference!.httpOnly);
        assert.strictEqual(preference!.sameSite, "Strict");
      } finally {
        fs.rmSync(profileDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(CookiesTestRuntime), Effect.runPromise));

  it("returns empty array for profile with no cookies", () =>
    Effect.gen(function* () {
      const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "firefox-empty-test-"));

      try {
        const database = new sqlite.DatabaseSync(path.join(profileDir, "cookies.sqlite"));
        database.exec(
          `CREATE TABLE moz_cookies (
            id INTEGER PRIMARY KEY, name TEXT, value TEXT, host TEXT,
            path TEXT, expiry INTEGER, isSecure INTEGER, isHttpOnly INTEGER, sameSite INTEGER
          )`,
        );
        database.close();

        const cookies = yield* Cookies;
        const firefoxBrowser = new FirefoxBrowser({
          profileName: "test-profile",
          profilePath: profileDir,
        });
        const result = yield* cookies.extract(firefoxBrowser);

        assert.isArray(result);
        assert.strictEqual(result.length, 0);
      } finally {
        fs.rmSync(profileDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(CookiesTestRuntime), Effect.runPromise));
});

describe("Cookies.extract (Safari)", () => {
  it("extracts cookies from a Safari binary cookies file", () =>
    Effect.gen(function* () {
      const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "safari-profile-test-"));

      try {
        const macEpochExpiry = 700_000_000;
        const binaryData = buildBinaryCookiesFile([
          {
            name: "safari_session",
            value: "xyz789",
            url: ".example.com",
            path: "/",
            expiration: macEpochExpiry,
            flags: 1 | 4,
          },
        ]);
        const cookieFilePath = path.join(profileDir, "Cookies.binarycookies");
        fs.writeFileSync(cookieFilePath, binaryData);

        const cookies = yield* Cookies;
        const safariBrowser = new SafariBrowser({
          cookieFilePath: Option.some(cookieFilePath),
        });
        const result = yield* cookies.extract(safariBrowser);

        assert.isArray(result);
        assert.strictEqual(result.length, 1);

        const cookie = result[0];
        assert.strictEqual(cookie.name, "safari_session");
        assert.strictEqual(cookie.value, "xyz789");
        assert.strictEqual(cookie.domain, "example.com");
        assert.isTrue(cookie.secure);
        assert.isTrue(cookie.httpOnly);
        assert.strictEqual(cookie.expires, macEpochExpiry + MAC_EPOCH_DELTA_SECONDS);
      } finally {
        fs.rmSync(profileDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(CookiesTestRuntime), Effect.runPromise));
});

describe("parseBinaryCookies domain stripping", () => {
  it("strips leading dots from all domain formats", () => {
    const binary = buildBinaryCookiesFile([
      {
        name: "dotted",
        value: "v1",
        url: ".example.com",
        path: "/",
        expiration: 700_000_000,
        flags: 0,
      },
      {
        name: "clean",
        value: "v2",
        url: "example.com",
        path: "/",
        expiration: 700_000_000,
        flags: 0,
      },
      {
        name: "subdomain",
        value: "v3",
        url: ".sub.example.com",
        path: "/",
        expiration: 700_000_000,
        flags: 0,
      },
    ]);

    const cookies = parseBinaryCookies(binary);
    assert.strictEqual(cookies[0].domain, "example.com");
    assert.strictEqual(cookies[1].domain, "example.com");
    assert.strictEqual(cookies[2].domain, "sub.example.com");
  });
});
