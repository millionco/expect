import pc from "picocolors";
import { logger } from "../utils/logger";

declare const __RULES_CONTENT__: Record<string, string>;

const STRIP_FRONTMATTER = /^---[\s\S]*?---\n+/;

const stripFrontmatter = (content: string): string => content.replace(STRIP_FRONTMATTER, "");

interface RuleDefinition {
  readonly slug: string;
  readonly description: string;
  readonly sources: ReadonlyArray<string>;
  readonly subRuleDir?: "rules" | "references";
}

const RULES: ReadonlyArray<RuleDefinition> = [
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

const getSkillContent = (rule: RuleDefinition): string | undefined => {
  const parts: string[] = [];
  for (const source of rule.sources) {
    const key = `${source}/SKILL.md`;
    const content = __RULES_CONTENT__[key];
    if (content) parts.push(stripFrontmatter(content));
  }
  if (parts.length === 0) return undefined;
  return parts.join("\n\n---\n\n");
};

const getSubRules = (rule: RuleDefinition): ReadonlyArray<string> => {
  if (!rule.subRuleDir) return [];
  const subRules: string[] = [];
  const primarySource = rule.sources[0];
  const prefix = `${primarySource}/${rule.subRuleDir}/`;

  for (const key of Object.keys(__RULES_CONTENT__)) {
    if (key.startsWith(prefix) && key.endsWith(".md")) {
      const filename = key.slice(prefix.length).replace(/\.md$/, "");
      subRules.push(filename);
    }
  }

  return subRules.sort();
};

const getSubRuleContent = (rule: RuleDefinition, subRuleName: string): string | undefined => {
  if (!rule.subRuleDir) return undefined;
  const primarySource = rule.sources[0];
  const key = `${primarySource}/${rule.subRuleDir}/${subRuleName}.md`;
  const content = __RULES_CONTENT__[key];
  if (content) return stripFrontmatter(content);
  return undefined;
};

const printToc = () => {
  console.log("# Available Rules\n");
  console.log("Display built-in rules and guidelines for coding agents.\n");
  console.log("## Usage\n");
  console.log("```");
  console.log("expect-cli rules [name]             show a rule");
  console.log("expect-cli rules [name] [sub-rule]  show a specific sub-rule");
  console.log("```\n");
  console.log("## Rules\n");

  for (const rule of RULES) {
    const subRules = getSubRules(rule);
    const subRuleCount = subRules.length > 0 ? ` (${subRules.length} sub-rules)` : "";
    console.log(`- **${rule.slug}** — ${rule.description}${subRuleCount}`);
  }

  console.log("");
};

const printRule = (rule: RuleDefinition) => {
  const content = getSkillContent(rule);
  if (!content) {
    logger.error(`Content not found for rule: ${rule.slug}`);
    process.exit(1);
  }

  console.log(content);

  const subRules = getSubRules(rule);
  if (subRules.length > 0) {
    console.log("\n## Available Sub-Rules\n");
    console.log(`Run \`expect-cli rules ${rule.slug} <sub-rule>\` for details.\n`);
    for (const subRule of subRules) {
      console.log(`- ${subRule}`);
    }
    console.log("");
  }
};

const printSubRule = (rule: RuleDefinition, subRuleName: string) => {
  const content = getSubRuleContent(rule, subRuleName);
  if (!content) {
    const subRules = getSubRules(rule);
    logger.error(`Unknown sub-rule: ${pc.bold(subRuleName)}`);
    if (subRules.length > 0) {
      logger.info(`Available sub-rules for ${pc.bold(rule.slug)}:`);
      for (const subRule of subRules) {
        logger.info(`  - ${subRule}`);
      }
    }
    process.exit(1);
  }

  console.log(content);
};

export const runRulesCommand = (name?: string, subRule?: string) => {
  if (!name) {
    printToc();
    return;
  }

  const rule = RULES.find((ruleEntry) => ruleEntry.slug === name);
  if (!rule) {
    logger.error(`Unknown rule: ${pc.bold(name)}`);
    logger.info("Available rules:");
    for (const ruleEntry of RULES) {
      logger.info(`  - ${ruleEntry.slug}`);
    }
    process.exit(1);
  }

  if (subRule) {
    printSubRule(rule, subRule);
  } else {
    printRule(rule);
  }
};
