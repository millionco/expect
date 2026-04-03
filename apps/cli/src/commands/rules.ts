import pc from "picocolors";
import { logger } from "../utils/logger";
import {
  RULES,
  findRule,
  getSkillContent,
  getSubRuleContent,
  getSubRules,
} from "@expect/browser/mcp/rules-content";

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

const printRule = (rule: (typeof RULES)[number]) => {
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

const printSubRule = (rule: (typeof RULES)[number], subRuleName: string) => {
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

  const rule = findRule(name);
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
