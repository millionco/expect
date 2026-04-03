import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const isRelevantMdFile = (relPath) => {
  if (relPath.endsWith("/SKILL.md") || relPath === "SKILL.md") return true;
  const parts = relPath.split("/");
  if (parts.length >= 2) {
    const parentDir = parts[parts.length - 2];
    if (parentDir === "rules" || parentDir === "references") return true;
  }
  return false;
};

const collectMdFiles = (baseDir, dir, prefix = "") => {
  const result = {};
  for (const entry of readdirSync(join(baseDir, dir))) {
    const fullPath = join(baseDir, dir, entry);
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(fullPath).isDirectory()) {
      Object.assign(result, collectMdFiles(baseDir, join(dir, entry), relPath));
    } else if (entry.endsWith(".md") && !entry.startsWith("_") && isRelevantMdFile(relPath)) {
      result[relPath] = readFileSync(fullPath, "utf-8");
    }
  }
  return result;
};

export const buildRulesContent = () => {
  const scriptDir = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = join(scriptDir, "..", "..", "..");
  const expectSkillDir = join(repoRoot, "packages", "expect-skill");
  const agentSkillsDir = join(repoRoot, ".agents", "skills");
  const content = {};

  const expectFiles = collectMdFiles(expectSkillDir, ".");
  for (const [key, value] of Object.entries(expectFiles)) {
    content[`expect-skill/${key}`] = value;
  }

  const agentFiles = collectMdFiles(agentSkillsDir, ".");
  for (const [key, value] of Object.entries(agentFiles)) {
    content[`agents/${key}`] = value;
  }

  return JSON.stringify(content);
};
