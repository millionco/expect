import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { Effect, Schema } from "effect";
import type { Component, Repository, Vulnerability } from "retire/lib/types";
import retireRepoRaw from "./retire-repo.json";

export class SecurityAuditError extends Schema.ErrorClass<SecurityAuditError>("SecurityAuditError")(
  {
    _tag: Schema.tag("SecurityAuditError"),
    cause: Schema.String,
  },
) {
  message = `Security audit failed: ${this.cause}`;
}

type Severity = "critical" | "high" | "medium" | "low";

interface SecurityFinding {
  readonly severity: Severity;
  readonly library: string;
  readonly version: string;
  readonly detail: string;
  readonly cves: readonly string[];
  readonly info: readonly string[];
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const KNOWN_SEVERITIES = new Set<string>(Object.keys(SEVERITY_ORDER));

const sha1Hasher = {
  sha1: (data: string) => createHash("sha1").update(data).digest("hex"),
};

let retireModulePromise: Promise<typeof import("retire/lib/retire.js")> | undefined;
let cachedRepo: Repository | undefined;

const loadRetire = () => {
  if (!retireModulePromise) {
    retireModulePromise = import("retire/lib/retire.js").then((mod) => mod.default ?? mod);
  }
  return retireModulePromise;
};

const loadRepo = (replaceVersion: (text: string) => string) => {
  if (!cachedRepo) {
    // HACK: bypassing retire.js's loadrepositoryFromFile to avoid filesystem I/O; the vendored JSON matches the Repository schema
    cachedRepo = JSON.parse(replaceVersion(JSON.stringify(retireRepoRaw))) as Repository;
  }
  return cachedRepo;
};

const normalizeSeverity = (raw: string | undefined): Severity =>
  raw && KNOWN_SEVERITIES.has(raw) ? (raw as Severity) : "medium";

const toFinding = (component: Component, vulnerability: Vulnerability): SecurityFinding => ({
  severity: normalizeSeverity(vulnerability.severity),
  library: component.component,
  version: component.version,
  detail:
    vulnerability.identifiers.summary ??
    `${component.component}@${component.version} has a known vulnerability`,
  cves: vulnerability.identifiers.CVE ?? [],
  info: vulnerability.info,
});

const extractFindings = (results: Component[]): SecurityFinding[] =>
  results.flatMap((component) =>
    (component.vulnerabilities ?? []).map((vulnerability) => toFinding(component, vulnerability)),
  );

const deduplicateFindings = (findings: SecurityFinding[]): SecurityFinding[] => {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.library}@${finding.version}:${finding.detail}:${finding.cves.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const fetchScriptContent = (page: Page, src: string) =>
  Effect.tryPromise({
    try: () =>
      page
        .context()
        .request.get(src)
        .then((response) => response.text()),
    catch: (cause) => new SecurityAuditError({ cause: `Failed to fetch ${src}: ${cause}` }),
  }).pipe(
    Effect.catchTag("SecurityAuditError", (error) =>
      Effect.logDebug("Skipping script content scan", { src, cause: error.cause }).pipe(
        Effect.as(undefined),
      ),
    ),
  );

export const runSecurityAudit = Effect.fn("runSecurityAudit")(function* (page: Page) {
  yield* Effect.annotateCurrentSpan({ url: page.url() });

  const retire = yield* Effect.tryPromise({
    try: () => loadRetire(),
    catch: (cause) => new SecurityAuditError({ cause: `Failed to load retire.js: ${cause}` }),
  });
  const repo = loadRepo(retire.replaceVersion);

  const scriptSources = yield* Effect.tryPromise({
    try: () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLScriptElement>("script"), (script) => ({
          src: script.src,
          content: script.src ? "" : (script.textContent ?? ""),
        })),
      ),
    catch: (cause) => new SecurityAuditError({ cause: `Failed to extract scripts: ${cause}` }),
  });

  const nested = yield* Effect.forEach(
    scriptSources,
    (script) =>
      Effect.gen(function* () {
        if (script.src) {
          const uriFindings = extractFindings(retire.scanUri(script.src, repo));
          const content = yield* fetchScriptContent(page, script.src);
          const contentFindings = content
            ? extractFindings(retire.scanFileContent(content, repo, sha1Hasher))
            : [];
          return [...uriFindings, ...contentFindings];
        }
        if (script.content) {
          return extractFindings(retire.scanFileContent(script.content, repo, sha1Hasher));
        }
        return [];
      }),
    { concurrency: "unbounded" },
  );

  const findings = deduplicateFindings(nested.flat()).sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  );

  yield* Effect.logInfo("Security audit complete", {
    findingCount: findings.length,
    scriptsScanned: scriptSources.length,
  });

  return {
    findings,
    summary: Object.fromEntries(
      ["total", "critical", "high", "medium", "low"].map((level) => [
        level,
        level === "total"
          ? findings.length
          : findings.filter((finding) => finding.severity === level).length,
      ]),
    ),
  };
});
