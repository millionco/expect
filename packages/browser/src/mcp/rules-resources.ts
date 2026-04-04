import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRuleContent, getRules, getSubRuleContent, rulesAvailable } from "./rules-content";

export const registerRulesResources = (server: McpServer) => {
  if (!rulesAvailable()) return;

  const rules = getRules();

  const promptLines = [
    "This MCP server provides built-in rules as resources. When you encounter a test failure with a `domain=` tag, or when a task involves one of the domains below, fetch the matching resource before writing code or attempting a fix.",
    "",
    "Fetch `expect://rules` for the full table of contents.",
    "",
    "Available rule resources:",
    "",
  ];
  for (const rule of rules) {
    const subRuleHint =
      rule.subRules.length > 0
        ? ` — fetch \`expect://rules/${rule.slug}/{sub-rule}\` for ${rule.subRules.length} detailed sub-rules`
        : "";
    promptLines.push(`- \`expect://rules/${rule.slug}\` — ${rule.description}${subRuleHint}`);
  }

  server.registerPrompt(
    "rules",
    { description: "Available rule resources for fixing domain-specific issues" },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: promptLines.join("\n") },
        },
      ],
    }),
  );

  const tocLines = ["# Available Rules", ""];
  for (const rule of rules) {
    const countSuffix = rule.subRules.length > 0 ? ` (${rule.subRules.length} sub-rules)` : "";
    tocLines.push(`- **${rule.slug}** — ${rule.description}${countSuffix}`);
  }

  server.registerResource(
    "rules-toc",
    "expect://rules",
    {
      title: "Rules",
      description: "Table of contents for all built-in rules and guidelines",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: tocLines.join("\n") }],
    }),
  );

  for (const rule of rules) {
    const subRuleList = rule.subRules.length > 0 ? ` (${rule.subRules.length} sub-rules)` : "";

    server.registerResource(
      `rule-${rule.slug}`,
      `expect://rules/${rule.slug}`,
      {
        title: rule.slug,
        description: `${rule.description}${subRuleList}`,
        mimeType: "text/markdown",
      },
      async (uri) => {
        const content = getRuleContent(rule);
        if (!content)
          return { contents: [{ uri: uri.href, text: `Rule not found: ${rule.slug}` }] };

        return { contents: [{ uri: uri.href, text: content }] };
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
          const content = getSubRuleContent(rule, String(subRule));
          if (!content) {
            return {
              contents: [{ uri: uri.href, text: `Sub-rule not found: ${String(subRule)}` }],
            };
          }
          return { contents: [{ uri: uri.href, text: content }] };
        },
      );
    }
  }
};
