import * as fs from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "playwright";
import { Effect, Schema } from "effect";

export class AccessibilityAuditError extends Schema.ErrorClass<AccessibilityAuditError>(
  "AccessibilityAuditError",
)({
  _tag: Schema.tag("AccessibilityAuditError"),
  engine: Schema.String,
  cause: Schema.String,
}) {
  message = `Accessibility audit failed (${this.engine}): ${this.cause}`;
}

interface AccessibilityNode {
  readonly selector: string;
  readonly html: string;
  readonly failureSummary: string;
}

interface AccessibilityViolation {
  readonly impact: "critical" | "serious" | "moderate" | "minor";
  readonly ruleId: string;
  readonly description: string;
  readonly helpUrl: string;
  readonly wcagTags: readonly string[];
  readonly nodes: readonly AccessibilityNode[];
}

interface AccessibilityAuditOptions {
  readonly selector?: string;
  readonly tags?: readonly string[];
}

interface IbmIssue {
  readonly ruleId: string;
  readonly value: readonly [string, string];
  readonly message: string;
  readonly path: { readonly dom: string } | undefined;
  readonly snippet: string | undefined;
}

interface IbmReport {
  readonly results: readonly IbmIssue[];
}

const DEFAULT_WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const IMPACT_ORDER: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

const IBM_SEVERITY_TO_IMPACT: Record<string, AccessibilityViolation["impact"]> = {
  VIOLATION: "serious",
  RECOMMENDATION: "moderate",
  INFORMATION: "minor",
};

let cachedAceScript: string | undefined;

const loadAceScript = () => {
  if (!cachedAceScript) {
    const require = createRequire(import.meta.url);
    const aceScriptPath = require.resolve("accessibility-checker-engine/ace.js");
    cachedAceScript = fs.readFileSync(aceScriptPath, "utf8");
  }
  return cachedAceScript;
};

export const runAccessibilityAudit = Effect.fn("Accessibility.runAccessibilityAudit")(function* (
  page: Page,
  options: AccessibilityAuditOptions = {},
) {
  const { default: AxeBuilder } = yield* Effect.promise(() => import("@axe-core/playwright"));

  let builder = new AxeBuilder({ page });
  const tags = options.tags ?? DEFAULT_WCAG_TAGS;
  builder = builder.withTags([...tags]);
  if (options.selector) {
    builder = builder.include(options.selector);
  }

  const aceScript = loadAceScript();

  const [axeResults, ibmReport] = yield* Effect.all(
    [
      Effect.tryPromise({
        try: () => builder.analyze(),
        catch: (cause) => new AccessibilityAuditError({ engine: "axe-core", cause: String(cause) }),
      }).pipe(
        Effect.catchTag("AccessibilityAuditError", (error) =>
          Effect.logWarning("axe-core audit failed", { cause: error.cause }).pipe(
            Effect.as(undefined),
          ),
        ),
      ),
      Effect.tryPromise({
        try: () => page.evaluate(aceScript),
        catch: (cause) =>
          new AccessibilityAuditError({ engine: "ibm-equal-access", cause: String(cause) }),
      }).pipe(
        // HACK: page.evaluate erases types across the serialization boundary; IBM engine has no TS types
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: (): Promise<IbmReport> =>
              page.evaluate(async () => {
                const ace = (globalThis as any).ace;
                const checker = new ace.Checker();
                const report = await checker.check(document, ["WCAG_2_2"]);
                return {
                  results: report.results.map(({ node: _node, ...rest }: any) => rest),
                };
              }),
            catch: (cause) =>
              new AccessibilityAuditError({ engine: "ibm-equal-access", cause: String(cause) }),
          }),
        ),
        Effect.catchTag("AccessibilityAuditError", (error) =>
          Effect.logWarning("IBM Equal Access audit failed", { cause: error.cause }).pipe(
            Effect.as(undefined),
          ),
        ),
      ),
    ] as const,
    { concurrency: 2 },
  );

  const axeViolations: AccessibilityViolation[] = axeResults
    ? axeResults.violations.map((violation) => ({
        impact: (violation.impact ?? "moderate") as AccessibilityViolation["impact"],
        ruleId: violation.id,
        description: violation.description,
        helpUrl: violation.helpUrl,
        wcagTags: violation.tags,
        nodes: violation.nodes.map((node) => ({
          selector: node.target.join(" "),
          html: node.html,
          failureSummary: node.failureSummary ?? "",
        })),
      }))
    : [];

  const axeRuleIds = new Set(axeViolations.map((violation) => violation.ruleId));

  const ibmViolations: AccessibilityViolation[] = ibmReport
    ? ibmReport.results
        .filter(
          (result) =>
            result.value[0] === "VIOLATION" &&
            (result.value[1] === "FAIL" || result.value[1] === "POTENTIAL") &&
            !axeRuleIds.has(result.ruleId),
        )
        .map((issue) => ({
          impact: IBM_SEVERITY_TO_IMPACT[issue.value[0]] ?? "moderate",
          ruleId: issue.ruleId,
          description: issue.message,
          helpUrl: `https://able.ibm.com/rules/archives/latest/doc/${issue.ruleId}`,
          wcagTags: [],
          nodes: [
            {
              selector: issue.path?.dom ?? "",
              html: issue.snippet ?? "",
              failureSummary: issue.message,
            },
          ],
        }))
    : [];

  const violations = [...axeViolations, ...ibmViolations].sort(
    (left, right) => (IMPACT_ORDER[left.impact] ?? 3) - (IMPACT_ORDER[right.impact] ?? 3),
  );

  yield* Effect.logInfo("Accessibility audit complete", {
    axeViolationCount: axeViolations.length,
    ibmViolationCount: ibmViolations.length,
    totalViolationCount: violations.length,
  });

  return {
    violations,
    summary: {
      total: violations.length,
      critical: violations.filter((violation) => violation.impact === "critical").length,
      serious: violations.filter((violation) => violation.impact === "serious").length,
      moderate: violations.filter((violation) => violation.impact === "moderate").length,
      minor: violations.filter((violation) => violation.impact === "minor").length,
    },
  };
});
