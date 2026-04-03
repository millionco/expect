declare const __RULES_CONTENT__: Record<string, string> | undefined;

export const rulesAvailable = (): boolean => typeof __RULES_CONTENT__ !== "undefined";

const contentMap = (): Record<string, string> =>
  typeof __RULES_CONTENT__ !== "undefined" ? __RULES_CONTENT__ : {};

const STRIP_FRONTMATTER = /^---[\s\S]*?---\n/;

const stripFrontmatter = (content: string): string => content.replace(STRIP_FRONTMATTER, "");

interface MergedSources {
  readonly slug: string;
  readonly sources: ReadonlyArray<string>;
}

export interface RuleDefinition {
  readonly slug: string;
  readonly description: string;
  readonly mergedSources?: ReadonlyArray<string>;
  readonly subRuleDir?: "rules" | "references";
}

const sourcesFor = (rule: RuleDefinition): ReadonlyArray<string> =>
  rule.mergedSources ?? [rule.slug];

export const RULES: ReadonlyArray<RuleDefinition> = [
  {
    slug: "accessibility",
    description: "WCAG 2.1 AA accessibility rules, ARIA, keyboard navigation, focus management",
    subRuleDir: "rules",
  },
  {
    slug: "animation",
    description:
      "CSS/UI animation patterns, performance, hover effects, transitions, Framer Motion",
    subRuleDir: "rules",
  },
  {
    slug: "design",
    description: "UI/UX design principles, web interface guidelines, typography, shadows, motion",
    mergedSources: ["design", "web-design"],
    subRuleDir: "rules",
  },
  {
    slug: "performance",
    description: "Web performance, Core Web Vitals, streaming, images, prefetch, resource budgets",
  },
  {
    slug: "react",
    description: "React and Next.js performance optimization, 59 rules across 9 categories",
    subRuleDir: "rules",
  },
  {
    slug: "security",
    description: "Browser security review: XSS, CSRF, CSP, CORS, open redirects, postMessage",
    subRuleDir: "references",
  },
  {
    slug: "seo",
    description: "SEO metadata, Open Graph, canonical URLs, structured data, robots directives",
  },
  {
    slug: "code-review",
    description: "Code review guidelines: bugs, performance, side effects, test coverage, design",
  },
  {
    slug: "deslop",
    description: "Simplify and refine code while preserving functionality",
  },
  {
    slug: "effect",
    description: "Effect-TS patterns for services, errors, layers, schemas, and atoms",
    subRuleDir: "references",
  },
  {
    slug: "effect-patterns",
    description: "Portable Effect patterns for promises with timeouts, retries, caching, tracing",
  },
  {
    slug: "skill-writing",
    description:
      "Write and improve agent skills (SKILL.md files), prompt structure, TDD for skills",
  },
];

export const getRuleContent = (rule: RuleDefinition): string | undefined => {
  const parts: string[] = [];
  for (const source of sourcesFor(rule)) {
    const content = contentMap()[`${source}/rule.md`];
    if (content) parts.push(stripFrontmatter(content));
  }
  if (parts.length === 0) return undefined;
  return parts.join("\n\n---\n\n");
};

export const getSubRules = (rule: RuleDefinition): ReadonlyArray<string> => {
  if (!rule.subRuleDir) return [];
  const prefix = `${rule.slug}/${rule.subRuleDir}/`;
  const subRules: string[] = [];

  for (const key of Object.keys(contentMap())) {
    if (key.startsWith(prefix) && key.endsWith(".md")) {
      subRules.push(key.slice(prefix.length).replace(/\.md$/, ""));
    }
  }

  return subRules.sort();
};

export const getSubRuleContent = (
  rule: RuleDefinition,
  subRuleName: string,
): string | undefined => {
  if (!rule.subRuleDir) return undefined;
  const content = contentMap()[`${rule.slug}/${rule.subRuleDir}/${subRuleName}.md`];
  if (content) return stripFrontmatter(content);
  return undefined;
};
