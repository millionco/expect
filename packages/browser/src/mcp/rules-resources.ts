import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  RULES,
  findRule,
  getRulesToc,
  getSkillContent,
  getSubRuleContent,
  getSubRules,
  rulesAvailable,
} from "./rules-content";

export const registerRulesResources = (server: McpServer) => {
  if (!rulesAvailable()) return;

  server.registerResource(
    "rules-toc",
    "expect://rules",
    {
      title: "Rules",
      description: "Table of contents for all built-in rules and guidelines",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: getRulesToc() }],
    }),
  );

  for (const rule of RULES) {
    const subRules = getSubRules(rule);
    const subRuleList = subRules.length > 0 ? ` (${subRules.length} sub-rules)` : "";

    server.registerResource(
      `rule-${rule.slug}`,
      `expect://rules/${rule.slug}`,
      {
        title: rule.slug,
        description: `${rule.description}${subRuleList}`,
        mimeType: "text/markdown",
      },
      async (uri) => {
        const content = getSkillContent(rule);
        if (!content)
          return { contents: [{ uri: uri.href, text: `Rule not found: ${rule.slug}` }] };

        const subRuleNames = getSubRules(rule);
        const appendix =
          subRuleNames.length > 0
            ? `\n\n## Available Sub-Rules\n\n${subRuleNames.map((name) => `- expect://rules/${rule.slug}/${name}`).join("\n")}\n`
            : "";

        return { contents: [{ uri: uri.href, text: content + appendix }] };
      },
    );

    if (rule.subRuleDir) {
      server.registerResource(
        `rule-${rule.slug}-sub`,
        new ResourceTemplate(`expect://rules/${rule.slug}/{subRule}`, { list: undefined }),
        {
          title: `${rule.slug} sub-rule`,
          description: `Detailed sub-rule for ${rule.slug}`,
          mimeType: "text/markdown",
        },
        async (uri, { subRule }) => {
          const subRuleName = subRule as string;
          const content = getSubRuleContent(rule, subRuleName);
          if (!content) {
            return { contents: [{ uri: uri.href, text: `Sub-rule not found: ${subRuleName}` }] };
          }
          return { contents: [{ uri: uri.href, text: content }] };
        },
      );
    }
  }
};
