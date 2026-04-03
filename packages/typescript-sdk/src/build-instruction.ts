import { ExpectConfigError } from "./errors";

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
    /* relative URL — falls through to baseUrl resolution */
  }

  if (!baseUrl) {
    throw new ExpectConfigError(
      `No baseUrl configured and URL "${url}" is relative.`,
      `configure({ baseUrl: "http://localhost:3000" })\nOr use a full URL: Expect.test({ url: "http://localhost:3000${url}", tests: [...] })`,
    );
  }

  return new URL(url, baseUrl).href;
};

export const buildInstruction = (url: string, tests: readonly string[]): string => {
  const lines = [`Navigate to ${url} and verify the following requirements:`, ""];

  for (const [index, title] of tests.entries()) {
    lines.push(`${index + 1}. ${title}`);
  }

  return lines.join("\n");
};
