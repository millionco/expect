import * as fs from "node:fs";
import * as path from "node:path";
import { createOptionsResponse, getCorsHeaders } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const pkg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "..", "cli", "package.json"), "utf-8"),
);

const corsOptions = { methods: "*" as const, headers: "*" as const };

export const GET = () =>
  new Response(pkg.version, {
    headers: {
      ...getCorsHeaders(corsOptions),
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });

export const OPTIONS = () => createOptionsResponse(corsOptions);
