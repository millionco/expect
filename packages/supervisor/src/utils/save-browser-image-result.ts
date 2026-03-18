import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { SCREENSHOT_DIRECTORY_PREFIX, SCREENSHOT_OUTPUT_DIRECTORY_PATH } from "../constants";

interface BrowserImageContent {
  data: string;
  mimeType: string;
}

const BrowserToolResultPayloadSchema = Schema.Struct({
  content: Schema.Array(Schema.Unknown),
});

const BrowserImageContentSchema = Schema.Struct({
  type: Schema.Literals(["image"] as const),
  data: Schema.String,
  mimeType: Schema.String,
});

export interface SavedBrowserImageResult {
  outputDirectoryPath: string;
  outputPath: string;
  resultText: string;
}

const getBrowserImageContent = (result: string): BrowserImageContent | null => {
  try {
    const payload = Schema.decodeUnknownSync(BrowserToolResultPayloadSchema)(JSON.parse(result));
    const browserImageContent = payload.content.find(Schema.is(BrowserImageContentSchema));
    if (!browserImageContent) return null;

    return {
      data: browserImageContent.data,
      mimeType: browserImageContent.mimeType,
    };
  } catch {
    return null;
  }
};

const getImageFileExtension = (mimeType: string): string | null => {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    default:
      return null;
  }
};

export const saveBrowserImageResult = (options: {
  browserAction: string;
  outputDirectoryPath?: string;
  result: string;
}): SavedBrowserImageResult | null => {
  const browserImageContent = getBrowserImageContent(options.result);
  if (!browserImageContent) return null;

  const imageFileExtension = getImageFileExtension(browserImageContent.mimeType);
  if (!imageFileExtension) return null;

  const outputDirectoryPath =
    options.outputDirectoryPath ??
    mkdtempSync(join(SCREENSHOT_OUTPUT_DIRECTORY_PATH, SCREENSHOT_DIRECTORY_PREFIX));
  const outputPath = join(
    outputDirectoryPath,
    `${options.browserAction}-${randomUUID()}.${imageFileExtension}`,
  );

  writeFileSync(outputPath, Buffer.from(browserImageContent.data, "base64"));

  return {
    outputDirectoryPath,
    outputPath,
    resultText: `Screenshot saved to ${outputPath}`,
  };
};
