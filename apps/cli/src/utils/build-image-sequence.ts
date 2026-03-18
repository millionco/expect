import { existsSync, readFileSync } from "node:fs";
import { detectTerminal } from "detect-terminal";
import { supportsKittyImages, supportsItermImages } from "./supports-inline-images";

interface ImageSequenceOptions {
  width?: string | number;
  height?: string | number;
}

const ESCAPE = "\x1b";
const OPERATING_SYSTEM_COMMAND = `${ESCAPE}]`;
const BELL = "\x07";
const APPLICATION_PROGRAM_COMMAND = `${ESCAPE}_`;
const STRING_TERMINATOR = `${ESCAPE}\\`;

const detectedTerminal = detectTerminal();
const IS_TMUX = detectedTerminal === "tmux" || detectedTerminal === "screen";

const wrapForTmux = (sequence: string): string => {
  if (!IS_TMUX) return sequence;
  return `${ESCAPE}Ptmux;${sequence.replaceAll(ESCAPE, `${ESCAPE}${ESCAPE}`)}${ESCAPE}\\`;
};

const createKittySequence = (absolutePath: string, options: ImageSequenceOptions): string => {
  const encodedPath = Buffer.from(absolutePath).toString("base64");
  let controlData = "a=T,t=f";

  if (options.width) {
    controlData += `,c=${options.width}`;
  }

  if (options.height) {
    controlData += `,r=${options.height}`;
  }

  return wrapForTmux(
    `${APPLICATION_PROGRAM_COMMAND}G${controlData};${encodedPath}${STRING_TERMINATOR}`,
  );
};

const createItermSequence = (imageBuffer: Buffer, options: ImageSequenceOptions): string => {
  let sequence = `${OPERATING_SYSTEM_COMMAND}1337;File=inline=1`;

  if (options.width) {
    sequence += `;width=${options.width}`;
  }

  if (options.height) {
    sequence += `;height=${options.height}`;
  }

  sequence += `;size=${imageBuffer.byteLength}:${imageBuffer.toString("base64")}${BELL}`;

  return wrapForTmux(sequence);
};

export const buildImageSequence = (
  absolutePath: string,
  options: ImageSequenceOptions = {},
): string | null => {
  if (!existsSync(absolutePath)) return null;

  if (supportsKittyImages) {
    return createKittySequence(absolutePath, options);
  }

  if (supportsItermImages) {
    try {
      const imageBuffer = readFileSync(absolutePath);
      return createItermSequence(imageBuffer, options);
    } catch {
      return null;
    }
  }

  return null;
};
