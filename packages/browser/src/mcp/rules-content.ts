declare const __RULES_CONTENT__: Record<string, string> | undefined;

const resolvedContent: Record<string, string> =
  typeof __RULES_CONTENT__ !== "undefined" ? __RULES_CONTENT__ : {};

export const rulesAvailable = (): boolean => Object.keys(resolvedContent).length > 0;

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n/;

const stripFrontmatter = (content: string): string => content.replace(FRONTMATTER_PATTERN, "");

const extractDescription = (content: string): string => {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) return "";
  const descriptionMatch = match[1].match(/description:\s*>?\s*\n?([\s\S]*?)(?:\n\w|\n---|$)/);
  if (!descriptionMatch) return "";
  return descriptionMatch[1].trim().replace(/\n\s*/g, " ");
};

export interface RuleDefinition {
  readonly slug: string;
  readonly description: string;
  readonly subRuleDir?: "rules" | "references";
  readonly subRules: ReadonlyArray<string>;
}

const discoverRules = (): ReadonlyArray<RuleDefinition> => {
  const map = resolvedContent;
  const slugs = new Set<string>();

  for (const key of Object.keys(map)) {
    if (key.endsWith("/rule.md")) {
      slugs.add(key.replace(/\/rule\.md$/, ""));
    }
  }

  const rules: RuleDefinition[] = [];

  for (const slug of [...slugs].sort()) {
    const ruleContent = map[`${slug}/rule.md`];
    const description = ruleContent ? extractDescription(ruleContent) : "";

    let subRuleDir: "rules" | "references" | undefined;
    const subRules: string[] = [];

    for (const dir of ["rules", "references"] as const) {
      const prefix = `${slug}/${dir}/`;
      for (const key of Object.keys(map)) {
        if (key.startsWith(prefix) && key.endsWith(".md")) {
          subRuleDir = dir;
          subRules.push(key.slice(prefix.length).replace(/\.md$/, ""));
        }
      }
      if (subRules.length > 0) break;
    }

    rules.push({ slug, description, subRuleDir, subRules: subRules.sort() });
  }

  return rules;
};

let cachedRules: ReadonlyArray<RuleDefinition> | undefined;

export const getRules = (): ReadonlyArray<RuleDefinition> => {
  if (!cachedRules) cachedRules = discoverRules();
  return cachedRules;
};

export const getRuleContent = (rule: RuleDefinition): string | undefined => {
  const content = resolvedContent[`${rule.slug}/rule.md`];
  if (!content) return undefined;
  return stripFrontmatter(content);
};

export const getSubRuleContent = (
  rule: RuleDefinition,
  subRuleName: string,
): string | undefined => {
  if (!rule.subRuleDir) return undefined;
  const content = resolvedContent[`${rule.slug}/${rule.subRuleDir}/${subRuleName}.md`];
  if (content) return stripFrontmatter(content);
  return undefined;
};
