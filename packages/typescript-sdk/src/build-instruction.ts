import { ExpectConfigError } from "./errors";
import type { Context, Test } from "./types";

export const resolveUrl = (url: unknown, baseUrl: string | undefined): string => {
  if (typeof url !== "string") {
    throw new ExpectConfigError(
      `Expected a URL string, got ${typeof url}.`,
      `Expect.test({ url: "http://localhost:3000/login", tests: [...] })`,
    );
  }

  try {
    return new URL(url).href;
  } catch {
    // relative URL - needs baseUrl
  }

  if (!baseUrl) {
    throw new ExpectConfigError(
      `No baseUrl configured and URL "${url}" is relative.`,
      `configure({ baseUrl: "http://localhost:3000" })\nOr use a full URL: Expect.test({ url: "http://localhost:3000${url}", tests: [...] })`,
    );
  }

  return new URL(url, baseUrl).href;
};

const formatContext = (context: Context): string => {
  if (typeof context === "string") return context;
  return JSON.stringify(context, undefined, 2);
};

export const buildInstruction = (
  url: string,
  sharedContext: Context | undefined,
  tests: readonly Test[],
): string => {
  const lines = [`Navigate to ${url} and verify the following requirements:`, ""];

  for (const [index, test] of tests.entries()) {
    const title = typeof test === "string" ? test : test.title;
    const context =
      typeof test === "string"
        ? sharedContext
        : (test.context ?? sharedContext);

    lines.push(`${index + 1}. ${title}`);
    if (context !== undefined) {
      lines.push(`   Context: ${formatContext(context)}`);
    }
  }

  return lines.join("\n");
};
