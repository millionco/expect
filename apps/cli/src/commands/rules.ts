import pc from "picocolors";
import { logger } from "../utils/logger";

const STRIP_FRONTMATTER = /^---[\s\S]*?---\n+/;

const stripFrontmatter = (content: string): string => content.replace(STRIP_FRONTMATTER, "");

interface RuleDefinition {
  readonly slug: string;
  readonly description: string;
  readonly sources: ReadonlyArray<string>;
  readonly subRuleDir?: "rules" | "references";
}

const expectSkillContent = import.meta.glob<string>(
  "../../../../packages/expect-skill/**/SKILL.md",
  { eager: true, query: "?raw", import: "default" },
);

const expectSubRuleContent = import.meta.glob<string>(
  [
    "../../../../packages/expect-skill/**/rules/*.md",
    "../../../../packages/expect-skill/**/references/*.md",
  ],
  { eager: true, query: "?raw", import: "default" },
);

const agentSkillContent = import.meta.glob<string>(
  "../../../../.agents/skills/**/SKILL.md",
  { eager: true, query: "?raw", import: "default" },
);

const agentSubRuleContent = import.meta.glob<string>(
  [
    "../../../../.agents/skills/**/rules/*.md",
    "../../../../.agents/skills/**/references/*.md",
  ],
  { eager: true, query: "?raw", import: "default" },
);

const allSkillContent = { ...expectSkillContent, ...agentSkillContent };
const allSubRuleContent = { ...expectSubRuleContent, ...agentSubRuleContent };

const RULES: ReadonlyArray<RuleDefinition> = [
  {
    slug: "accessibility",
    description: "WCAG 2.1 AA accessibility rules, ARIA, keyboard navigation, focus management",
    sources: ["packages/expect-skill/fixing-accessibility"],
    subRuleDir: "rules",
  },
  {
    slug: "animation",
    description: "CSS/UI animation patterns, performance, hover effects, transitions, Framer Motion",
    sources: ["packages/expect-skill/fixing-animation"],
    subRuleDir: "rules",
  },
  {
    slug: "design",
    description: "UI/UX design principles, web interface guidelines, typography, shadows, motion",
    sources: ["packages/expect-skill/design", "packages/expect-skill/web-design-guidelines"],
    subRuleDir: "rules",
  },
  {
    slug: "performance",
    description: "Web performance, Core Web Vitals, streaming, images, prefetch, resource budgets",
    sources: ["packages/expect-skill/performance"],
  },
  {
    slug: "react",
    description: "React and Next.js performance optimization, 59 rules across 9 categories",
    sources: ["packages/expect-skill/react-best-practices"],
    subRuleDir: "rules",
  },
  {
    slug: "security",
    description: "Browser security review: XSS, CSRF, CSP, CORS, open redirects, postMessage",
    sources: ["packages/expect-skill/security-review"],
    subRuleDir: "references",
  },
  {
    slug: "seo",
    description: "SEO metadata, Open Graph, canonical URLs, structured data, robots directives",
    sources: ["packages/expect-skill/fixing-seo"],
  },
  {
    slug: "code-review",
    description: "Code review guidelines: bugs, performance, side effects, test coverage, design",
    sources: [".agents/skills/code-review"],
  },
  {
    slug: "deslop",
    description: "Simplify and refine code while preserving functionality",
    sources: [".agents/skills/deslop"],
  },
  {
    slug: "effect",
    description: "Effect-TS patterns for services, errors, layers, schemas, and atoms",
    sources: [".agents/skills/effect-best-practices"],
    subRuleDir: "references",
  },
  {
    slug: "effect-patterns",
    description: "Portable Effect patterns for promises with timeouts, retries, caching, tracing",
    sources: [".agents/skills/effect-portable-patterns"],
  },
  {
    slug: "skill-writing",
    description: "Write and improve agent skills (SKILL.md files), prompt structure, TDD for skills",
    sources: [".agents/skills/skill-writing"],
  },
];

const findGlobContent = (
  contentMap: Record<string, string>,
  sourcePath: string,
): string | undefined => {
  for (const [globPath, content] of Object.entries(contentMap)) {
    if (globPath.includes(sourcePath)) return content;
  }
  return undefined;
};

const getSkillContent = (rule: RuleDefinition): string | undefined => {
  const parts: string[] = [];
  for (const source of rule.sources) {
    const content = findGlobContent(allSkillContent, `${source}/SKILL.md`);
    if (content) parts.push(stripFrontmatter(content));
  }
  if (parts.length === 0) return undefined;
  return parts.join("\n\n---\n\n");
};

const getSubRules = (rule: RuleDefinition): ReadonlyArray<string> => {
  if (!rule.subRuleDir) return [];
  const subRules: string[] = [];
  const primarySource = rule.sources[0];
  const dirSegment = `${primarySource}/${rule.subRuleDir}/`;

  for (const globPath of Object.keys(allSubRuleContent)) {
    if (globPath.includes(dirSegment)) {
      const filename = globPath.split("/").pop();
      if (filename && filename.endsWith(".md") && !filename.startsWith("_")) {
        subRules.push(filename.replace(/\.md$/, ""));
      }
    }
  }

  return subRules.sort();
};

const getSubRuleContent = (rule: RuleDefinition, subRuleName: string): string | undefined => {
  if (!rule.subRuleDir) return undefined;
  const primarySource = rule.sources[0];
  const searchPath = `${primarySource}/${rule.subRuleDir}/${subRuleName}.md`;
  const content = findGlobContent(allSubRuleContent, searchPath);
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
