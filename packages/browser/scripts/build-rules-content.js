import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const isRelevantMdFile = (relativePath) => {
  if (relativePath.endsWith("/rule.md") || relativePath === "rule.md") return true;
  const segments = relativePath.split("/");
  if (segments.length >= 2) {
    const parentDirectory = segments[segments.length - 2];
    if (parentDirectory === "rules" || parentDirectory === "references") return true;
  }
  return false;
};

const collectMarkdownFiles = (baseDirectory, directory, prefix = "") => {
  const files = {};
  for (const entry of fs.readdirSync(path.join(baseDirectory, directory))) {
    const fullPath = path.join(baseDirectory, directory, entry);
    const relativePath = prefix ? `${prefix}/${entry}` : entry;
    if (fs.statSync(fullPath).isDirectory()) {
      Object.assign(files, collectMarkdownFiles(baseDirectory, path.join(directory, entry), relativePath));
    } else if (entry.endsWith(".md") && !entry.startsWith("_") && isRelevantMdFile(relativePath)) {
      files[relativePath] = fs.readFileSync(fullPath, "utf-8");
    }
  }
  return files;
};

export const buildRulesContent = () => {
  const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
  const resourcesDirectory = path.join(scriptDirectory, "..", "src", "mcp", "resources");
  return JSON.stringify(collectMarkdownFiles(resourcesDirectory, "."));
};
