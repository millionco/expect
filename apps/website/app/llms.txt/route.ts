import * as fs from "fs";
import { NextResponse } from "next/server";
import * as path from "path";

const root = path.join(process.cwd(), "..", "..");

const readme = fs
  .readFileSync(path.join(root, "README.md"), "utf-8")
  .replace(/^# <img[^>]*\/>\s*/m, "# ")
  .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)\n?/g, "");

const skill = fs
  .readFileSync(path.join(root, "packages", "expect-skill", "SKILL.md"), "utf-8")
  .replace(/^---[\s\S]*?---\n+/, "");

const content = `${readme.trim()}\n\n---\n\n${skill.trim()}\n`;

export const GET = () =>
  new NextResponse(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
