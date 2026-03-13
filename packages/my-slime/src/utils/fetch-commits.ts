import { execSync } from "child_process";

export interface Commit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  relativeDate: string;
}

const GIT_TIMEOUT_MS = 5000;
const FIELD_SEPARATOR = "---FIELD---";

export const fetchCommits = (limit: number = 50): Commit[] => {
  try {
    const format = ["%H", "%h", "%s", "%an", "%cr"].join(FIELD_SEPARATOR);
    const output = execSync(
      `git log --format="${format}" -n ${limit}`,
      { encoding: "utf-8", timeout: GIT_TIMEOUT_MS },
    ).trim();

    if (!output) return [];

    return output.split("\n").filter(Boolean).map((line) => {
      const [hash, shortHash, subject, author, relativeDate] = line.split(FIELD_SEPARATOR);
      return { hash, shortHash, subject, author, relativeDate };
    });
  } catch {
    return [];
  }
};
