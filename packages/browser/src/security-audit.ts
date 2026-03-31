import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { Effect, Schema } from "effect";
import type { Component, Repository } from "retire/lib/types";
import retireRepoRaw from "./retire-repo.json";

export class SecurityAuditError extends Schema.ErrorClass<SecurityAuditError>(
  "SecurityAuditError",
)({
  _tag: Schema.tag("SecurityAuditError"),
  cause: Schema.String,
}) {
  message = `Security audit failed: ${this.cause}`;
}

interface SecurityFinding {
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly library: string;
  readonly version: string;
  readonly detail: string;
  readonly cves: readonly string[];
  readonly info: readonly string[];
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const sha1Hasher = {
  sha1: (data: string) => createHash("sha1").update(data).digest("hex"),
};

let cachedRepo: Repository | undefined;

const loadRepo = (replaceVersion: (text: string) => string) => {
  if (!cachedRepo) {
    // HACK: bypassing retire.js's loadrepositoryFromFile to avoid filesystem I/O; the vendored JSON matches the Repository schema
    cachedRepo = JSON.parse(replaceVersion(JSON.stringify(retireRepoRaw))) as Repository;
  }
  return cachedRepo;
};

export const runSecurityAudit = Effect.fn("runSecurityAudit")(function* (page: Page) {
  yield* Effect.annotateCurrentSpan({ url: page.url() });

  const retire = yield* Effect.tryPromise({
    try: async () => {
      const mod = await import("retire/lib/retire.js");
      return mod.default ?? mod;
    },
    catch: (cause) => new SecurityAuditError({ cause: `Failed to load retire.js: ${cause}` }),
  });

  const repo = loadRepo(retire.replaceVersion);

  const scriptSources = yield* Effect.tryPromise({
    try: () =>
      page.evaluate(() => {
        const scripts: Array<{ src: string; content: string }> = [];
        for (const script of document.querySelectorAll<HTMLScriptElement>("script")) {
          scripts.push({
            src: script.src,
            content: script.src ? "" : script.textContent ?? "",
          });
        }
        return scripts;
      }),
    catch: (cause) => new SecurityAuditError({ cause: `Failed to extract scripts: ${cause}` }),
  });

  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();

  const addFindings = (results: Component[]) => {
    for (const result of results) {
      if (!retire.isVulnerable([result]) || !result.vulnerabilities) continue;
      for (const vulnerability of result.vulnerabilities) {
        const key = `${result.component}@${result.version}:${vulnerability.identifiers.summary ?? vulnerability.info[0] ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          severity: (vulnerability.severity as SecurityFinding["severity"]) ?? "medium",
          library: result.component,
          version: result.version,
          detail:
            vulnerability.identifiers.summary ??
            `${result.component}@${result.version} has a known vulnerability`,
          cves: vulnerability.identifiers.CVE ?? [],
          info: vulnerability.info,
        });
      }
    }
  };

  for (const script of scriptSources) {
    if (script.src) {
      addFindings(retire.scanUri(script.src, repo));

      const content = yield* Effect.tryPromise({
        try: () => page.context().request.get(script.src).then((response) => response.text()),
        catch: (cause) =>
          new SecurityAuditError({ cause: `Failed to fetch script ${script.src}: ${cause}` }),
      }).pipe(
        Effect.catchTag("SecurityAuditError", (error) =>
          Effect.logDebug("Skipping script content scan", {
            src: script.src,
            cause: error.cause,
          }).pipe(Effect.as(undefined)),
        ),
      );
      if (content) {
        addFindings(retire.scanFileContent(content, repo, sha1Hasher));
      }
    } else if (script.content) {
      addFindings(retire.scanFileContent(script.content, repo, sha1Hasher));
    }
  }

  findings.sort(
    (left, right) => (SEVERITY_ORDER[left.severity] ?? 3) - (SEVERITY_ORDER[right.severity] ?? 3),
  );

  yield* Effect.logInfo("Security audit complete", {
    findingCount: findings.length,
    scriptsScanned: scriptSources.length,
  });

  const summary = {
    total: findings.length,
    critical: findings.filter((finding) => finding.severity === "critical").length,
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
  };

  return { findings, summary };
});
