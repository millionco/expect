import * as fs from "node:fs";
import { NextResponse } from "next/server";
import * as path from "node:path";

const skill = fs.readFileSync(
  path.join(process.cwd(), "..", "..", "packages", "expect-skill", "SKILL.md"),
  "utf-8",
).replace(/^---[\s\S]*?---\n+/, "");

export const GET = () =>
  new NextResponse(skill, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
