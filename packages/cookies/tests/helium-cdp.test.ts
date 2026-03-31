import { describe, it, assert } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { CdpClient } from "../src/cdp-client";
import * as fs from "node:fs";
import * as path from "node:path";

const HELIUM_PROFILE_PATH = path.join(
  process.env["HOME"]!,
  "Library/Application Support/net.imput.helium/System Profile",
);
const HELIUM_EXECUTABLE_PATH = "/Applications/Helium.app/Contents/MacOS/Helium";

const hasHelium =
  fs.existsSync(HELIUM_PROFILE_PATH) && fs.existsSync(HELIUM_EXECUTABLE_PATH);

describe.skipIf(!hasHelium)("Helium CDP", () => {
  it.live("extracts cookies from Helium via CDP", () =>
    Effect.gen(function* () {
      const cdpClient = yield* CdpClient;
      const cookies = yield* cdpClient.extractCookies({
        key: "helium",
        profilePath: HELIUM_PROFILE_PATH,
        executablePath: HELIUM_EXECUTABLE_PATH,
      });

      console.error(`[Helium] extracted ${cookies.length} cookies`);
      if (cookies.length > 0) {
        console.error(`[Helium] first 5:`, cookies.slice(0, 5).map((c) => `${c.name}@${c.domain}`));
      }

      assert.isAbove(cookies.length, 0, "Helium should have cookies");
    }).pipe(Effect.scoped, Effect.provide(CdpClient.layer)),
  { timeout: 60_000 });

  it.live("Helium profile directory contains expected files", () =>
    Effect.gen(function* () {
      const files = fs.readdirSync(HELIUM_PROFILE_PATH);
      console.error(`[Helium] profile files:`, files.join(", "));

      const parentDir = path.dirname(HELIUM_PROFILE_PATH);
      const parentFiles = fs.readdirSync(parentDir);
      console.error(`[Helium] parent dir files:`, parentFiles.join(", "));

      const hasLocalState = fs.existsSync(path.join(parentDir, "Local State"));
      console.error(`[Helium] has Local State:`, hasLocalState);

      assert.isTrue(files.length > 0, "profile should have files");
    }),
  { timeout: 10_000 });
});
