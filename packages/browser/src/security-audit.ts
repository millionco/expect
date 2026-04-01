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

interface SecurityFinding {
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly library: string;
  readonly version: string;
  readonly detail: string;
  readonly cves: readonly string[];
  readonly info: readonly string[];
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const sha1Hasher = {
  sha1: (data: string) => createHash("sha1").update(data).digest("hex"),
};

let cachedRetire: typeof import("retire/lib/retire.js") | undefined;
let cachedRepo: Repository | undefined;

const loadRetire = async () => {
  if (!cachedRetire) {
    const mod = await import("retire/lib/retire.js");
    cachedRetire = mod.default ?? mod;
  }
  return cachedRetire;
};

const loadRepo = (replaceVersion: (text: string) => string) => {
  if (!cachedRepo) {
    // HACK: bypassing retire.js's loadrepositoryFromFile to avoid filesystem I/O; the vendored JSON matches the Repository schema
    cachedRepo = JSON.parse(replaceVersion(JSON.stringify(retireRepoRaw))) as Repository;
  }
  return cachedRepo;
};

const toFinding = (component: Component, vulnerability: Vulnerability): SecurityFinding => ({
  severity: (vulnerability.severity as SecurityFinding["severity"]) ?? "medium",
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

const scanScript = (page: Page, retire: NonNullable<typeof cachedRetire>, repo: Repository) =>
  Effect.fn("scanScript")(function* (script: { src: string; content: string }) {
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
  });

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

  const nested = yield* Effect.forEach(scriptSources, scanScript(page, retire, repo));
  const findings = nested
    .flat()
    .filter(
      ((seen) => (finding: SecurityFinding) => {
        const key = `${finding.library}@${finding.version}:${finding.detail}:${finding.cves.join(",")}`;
        return seen.has(key) ? false : (seen.add(key), true);
      })(new Set<string>()),
    )
    .sort(
      (left, right) => (SEVERITY_ORDER[left.severity] ?? 3) - (SEVERITY_ORDER[right.severity] ?? 3),
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
