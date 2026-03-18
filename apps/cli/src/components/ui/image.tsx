import { resolve } from "node:path";
import { useEffect, useRef } from "react";
import { useStdout } from "ink";
import { buildImageSequence } from "../../utils/build-image-sequence";
import { supportsInlineImages } from "../../utils/supports-inline-images";
import { FileLink } from "./file-link";

interface ImageProps {
  src: string;
  alt?: string;
  width?: string | number;
  height?: string | number;
}

export const Image = ({ src, alt, width, height }: ImageProps) => {
  const absolutePath = resolve(src);
  const { write } = useStdout();
  const hasRendered = useRef(false);

  useEffect(() => {
    if (hasRendered.current) return;

    const sequence = buildImageSequence(absolutePath, { width, height });
    if (sequence) {
      write(sequence + "\n");
      hasRendered.current = true;
    }
  }, [absolutePath, width, height, write]);

  if (supportsInlineImages) {
    return null;
  }

  return <FileLink path={absolutePath} label={alt} />;
};
