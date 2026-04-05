import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { join } from "path";

export const dynamic = "force-static";

const skill = readFileSync(
  join(process.cwd(), "..", "..", "packages", "expect-skill", "SKILL.md"),
  "utf-8",
).replace(/^---[\s\S]*?---\n+/, "");

export const GET = () =>
  new NextResponse(skill, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
