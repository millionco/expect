import type { Requirement } from "./types";

const formatData = (data: string | Record<string, unknown>): string => {
  if (typeof data === "string") return data;
  return JSON.stringify(data, undefined, 2);
};

export const buildInstruction = (
  url: string,
  targetData: string | Record<string, unknown> | undefined,
  requirements: readonly Requirement[],
): string => {
  const lines: string[] = [
    `Navigate to ${url} and verify the following requirements:`,
    "",
  ];

  for (let index = 0; index < requirements.length; index++) {
    const requirement = requirements[index]!;
    const number = index + 1;

    if (typeof requirement === "string") {
      lines.push(`${number}. ${requirement}`);
      if (targetData) {
        lines.push(`   Context: ${formatData(targetData)}`);
      }
    } else {
      lines.push(`${number}. ${requirement.requirement}`);
      const data = requirement.data ?? targetData;
      if (data) {
        lines.push(`   Context: ${formatData(data)}`);
      }
    }
  }

  return lines.join("\n");
};

export const resolveUrl = (url: string, baseUrl: string | undefined): string => {
  if (typeof url !== "string") {
    throw new Error(
      `ExpectConfigError: Expected a URL string but received ${typeof url}.\n\nFix: expect("http://localhost:3000/login").toPass([...])`,
    );
  }
  if (url.startsWith("http://") || url.startsWith("https://")) return url;

  if (!baseUrl) {
    const fix = `configure({ baseUrl: "http://localhost:3000" })\nOr use a full URL: expect("http://localhost:3000${url}").toPass([...])`;
    throw new Error(
      `ExpectConfigError: No baseUrl configured and URL "${url}" is relative.\n\nFix: ${fix}`,
    );
  }

  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = url.startsWith("/") ? url : `/${url}`;
  return `${normalizedBase}${normalizedPath}`;
};
