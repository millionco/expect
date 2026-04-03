declare const __RULES_CONTENT__: Record<string, string> | undefined;

const rulesContentMap = (): Record<string, string> =>
  typeof __RULES_CONTENT__ !== "undefined" ? __RULES_CONTENT__ : {};

export const rulesAvailable = (): boolean => typeof __RULES_CONTENT__ !== "undefined";

const STRIP_FRONTMATTER = /^---[\s\S]*?---\n+/;

const stripFrontmatter = (content: string): string => content.replace(STRIP_FRONTMATTER, "");

const rewriteSubRuleRefs = (content: string, slug: string): string =>
  content
    .replace(/`rules\/([^`]+)\.md`/g, (_, name) => `\`expect-cli rules ${slug} ${name}\``)
    .replace(/`references\/([^`]+)\.md`/g, (_, name) => `\`expect-cli rules ${slug} ${name}\``)
    .replace(
      /See `rules\/` for detailed guides[^.]*\./g,
      `Run \`expect-cli rules ${slug} <sub-rule>\` for detailed guides.`,
    )
    .replace(
      /Read individual rule files in `rules\/`[^.]*/g,
      `Run \`expect-cli rules ${slug} <sub-rule>\` for detailed rule content`,
    )
    .replace(
      /Read individual rule files for detailed explanations and code examples:/g,
      "Run individual sub-rule commands for detailed explanations and code examples:",
    )
    .replace(/^rules\/[\w-]+\.md$/gm, (match) => {
      const name = match.replace(/^rules\//, "").replace(/\.md$/, "");
      return `expect-cli rules ${slug} ${name}`;
    });

export interface RuleDefinition {
  readonly slug: string;
  readonly description: string;
  readonly sources: ReadonlyArray<string>;
  readonly subRuleDir?: "rules" | "references";
}

export const RULES: ReadonlyArray<RuleDefinition> = [
  {
    slug: "accessibility",
    description: "WCAG 2.1 AA accessibility rules, ARIA, keyboard navigation, focus management",
    sources: ["expect-skill/fixing-accessibility"],
    subRuleDir: "rules",
  },
  {
    slug: "animation",
    description:
      "CSS/UI animation patterns, performance, hover effects, transitions, Framer Motion",
    sources: ["expect-skill/fixing-animation"],
    subRuleDir: "rules",
  },
  {
    slug: "design",
    description: "UI/UX design principles, web interface guidelines, typography, shadows, motion",
    sources: ["expect-skill/design", "expect-skill/web-design-guidelines"],
    subRuleDir: "rules",
  },
  {
    slug: "performance",
    description: "Web performance, Core Web Vitals, streaming, images, prefetch, resource budgets",
    sources: ["expect-skill/performance"],
  },
  {
    slug: "react",
    description: "React and Next.js performance optimization, 59 rules across 9 categories",
    sources: ["expect-skill/react-best-practices"],
    subRuleDir: "rules",
  },
  {
    slug: "security",
    description: "Browser security review: XSS, CSRF, CSP, CORS, open redirects, postMessage",
    sources: ["expect-skill/security-review"],
    subRuleDir: "references",
  },
  {
    slug: "seo",
    description: "SEO metadata, Open Graph, canonical URLs, structured data, robots directives",
    sources: ["expect-skill/fixing-seo"],
  },
  {
    slug: "code-review",
    description: "Code review guidelines: bugs, performance, side effects, test coverage, design",
    sources: ["agents/code-review"],
  },
  {
    slug: "deslop",
    description: "Simplify and refine code while preserving functionality",
    sources: ["agents/deslop"],
  },
  {
    slug: "effect",
    description: "Effect-TS patterns for services, errors, layers, schemas, and atoms",
    sources: ["agents/effect-best-practices"],
    subRuleDir: "references",
  },
  {
    slug: "effect-patterns",
    description: "Portable Effect patterns for promises with timeouts, retries, caching, tracing",
    sources: ["agents/effect-portable-patterns"],
  },
  {
    slug: "skill-writing",
    description:
      "Write and improve agent skills (SKILL.md files), prompt structure, TDD for skills",
    sources: ["agents/skill-writing"],
  },
];

export const getSkillContent = (rule: RuleDefinition): string | undefined => {
  const parts: string[] = [];
  for (const source of rule.sources) {
    const key = `${source}/SKILL.md`;
    const content = rulesContentMap()[key];
    if (content) parts.push(stripFrontmatter(content));
  }
  if (parts.length === 0) return undefined;
  const merged = parts.join("\n\n---\n\n");
  return rule.subRuleDir ? rewriteSubRuleRefs(merged, rule.slug) : merged;
};

export const getSubRules = (rule: RuleDefinition): ReadonlyArray<string> => {
  if (!rule.subRuleDir) return [];
  const subRules: string[] = [];
  const primarySource = rule.sources[0];
  const prefix = `${primarySource}/${rule.subRuleDir}/`;

  for (const key of Object.keys(rulesContentMap())) {
    if (key.startsWith(prefix) && key.endsWith(".md")) {
      const filename = key.slice(prefix.length).replace(/\.md$/, "");
      subRules.push(filename);
    }
  }

  return subRules.sort();
};

export const getSubRuleContent = (
  rule: RuleDefinition,
  subRuleName: string,
): string | undefined => {
  if (!rule.subRuleDir) return undefined;
  const primarySource = rule.sources[0];
  const key = `${primarySource}/${rule.subRuleDir}/${subRuleName}.md`;
  const content = rulesContentMap()[key];
  if (content) return stripFrontmatter(content);
  return undefined;
};

export const findRule = (slug: string): RuleDefinition | undefined =>
  RULES.find((rule) => rule.slug === slug);

export const getRulesToc = (): string => {
  const lines = ["# Available Rules", ""];
  for (const rule of RULES) {
    const subRules = getSubRules(rule);
    const subRuleCount = subRules.length > 0 ? ` (${subRules.length} sub-rules)` : "";
    lines.push(`- **${rule.slug}** — ${rule.description}${subRuleCount}`);
  }
  return lines.join("\n");
};
