import * as fs from "node:fs";
import * as path from "node:path";
import { Predicate } from "effect";
import { LOCK_FILE_TO_AGENT, PROJECT_SCAN_MAX_DEPTH, type PackageManager } from "../constants";

export type WebFramework =
  | "next"
  | "vite"
  | "remix"
  | "astro"
  | "angular"
  | "nuxt"
  | "gatsby"
  | "svelte"
  | "webpack";

export type { PackageManager } from "../constants";

export interface DetectedProject {
  readonly name: string;
  readonly path: string;
  readonly framework: WebFramework;
  readonly defaultPort: number;
  readonly devCommand: string | undefined;
  readonly packageManager: PackageManager;
}

const FRAMEWORK_DEPS: readonly [string, WebFramework][] = [
  ["next", "next"],
  ["@remix-run/react", "remix"],
  ["remix", "remix"],
  ["astro", "astro"],
  ["@angular/core", "angular"],
  ["nuxt", "nuxt"],
  ["gatsby", "gatsby"],
  ["@sveltejs/kit", "svelte"],
  ["vite", "vite"],
  ["webpack-dev-server", "webpack"],
];

const FRAMEWORK_DEFAULT_PORTS: Record<WebFramework, number> = {
  next: 3000,
  vite: 5173,
  remix: 5173,
  astro: 4321,
  angular: 4200,
  nuxt: 3000,
  gatsby: 8000,
  svelte: 5173,
  webpack: 8080,
};

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".cache",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "test-results",
  ".output",
  ".nuxt",
  ".svelte-kit",
  ".angular",
  ".expect",
]);

const readPackageJson = (projectPath: string): Record<string, unknown> | undefined => {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) return undefined;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    return Predicate.isObject(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const getAllDeps = (packageJson: Record<string, unknown>): Record<string, unknown> => ({
  ...(Predicate.isObject(packageJson["dependencies"])
    ? (packageJson["dependencies"] as Record<string, unknown>)
    : {}),
  ...(Predicate.isObject(packageJson["devDependencies"])
    ? (packageJson["devDependencies"] as Record<string, unknown>)
    : {}),
});

const detectFramework = (packageJson: Record<string, unknown>): WebFramework | undefined => {
  const allDeps = getAllDeps(packageJson);
  for (const [depName, framework] of FRAMEWORK_DEPS) {
    if (allDeps[depName]) return framework;
  }
  return undefined;
};

const getDevCommand = (packageJson: Record<string, unknown>): string | undefined => {
  const scripts = packageJson["scripts"];
  if (!Predicate.isObject(scripts)) return undefined;

  const scriptMap = scripts as Record<string, unknown>;
  if (typeof scriptMap["dev"] === "string") return scriptMap["dev"];

  const devKey = Object.keys(scriptMap).find((key) => key.startsWith("dev"));
  if (devKey && typeof scriptMap[devKey] === "string") return scriptMap[devKey];

  return undefined;
};

const extractPortFromCommand = (command: string): number | undefined => {
  const flagMatch = command.match(/(?:--port|-p)[=\s]+(\d+)/);
  if (flagMatch) {
    const port = Number(flagMatch[1]);
    if (port >= 1 && port <= 65535) return port;
  }

  const envMatch = command.match(/\bPORT=(\d+)/);
  if (envMatch) {
    const port = Number(envMatch[1]);
    if (port >= 1 && port <= 65535) return port;
  }

  return undefined;
};

const detectPackageManager = (projectPath: string): PackageManager => {
  let current = path.resolve(projectPath);
  const root = path.resolve("/");

  while (current !== root) {
    for (const [lockFile, manager] of Object.entries(LOCK_FILE_TO_AGENT)) {
      if (fs.existsSync(path.join(current, lockFile))) return manager;
    }
    const parent = path.resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }

  return "npm";
};

const buildProject = (projectPath: string): DetectedProject | undefined => {
  const packageJson = readPackageJson(projectPath);
  if (!packageJson) return undefined;

  const framework = detectFramework(packageJson);
  if (!framework) return undefined;

  const devCommand = getDevCommand(packageJson);
  const commandPort = devCommand ? extractPortFromCommand(devCommand) : undefined;
  const name =
    typeof packageJson["name"] === "string" ? packageJson["name"] : path.basename(projectPath);

  return {
    name,
    path: projectPath,
    framework,
    defaultPort: commandPort ?? FRAMEWORK_DEFAULT_PORTS[framework],
    devCommand,
    packageManager: detectPackageManager(projectPath),
  };
};

const getWorkspacePatterns = (projectRoot: string): string[] => {
  const patterns: string[] = [];

  const pnpmWorkspacePath = path.join(projectRoot, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmWorkspacePath)) {
    try {
      const content = fs.readFileSync(pnpmWorkspacePath, "utf-8");
      let inPackages = false;

      for (const line of content.split("\n")) {
        if (/^packages:\s*$/.test(line)) {
          inPackages = true;
          continue;
        }
        if (inPackages) {
          if (/^[a-zA-Z]/.test(line)) {
            inPackages = false;
            continue;
          }
          if (line.trim() === "") continue;
          const match = line.match(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$/);
          if (match) patterns.push(match[1].trim());
        }
      }
    } catch {
      return patterns;
    }
  }

  const packageJson = readPackageJson(projectRoot);
  if (packageJson) {
    const workspaces = packageJson["workspaces"];
    if (Array.isArray(workspaces)) {
      for (const workspace of workspaces) {
        if (typeof workspace === "string") patterns.push(workspace);
      }
    } else if (Predicate.isObject(workspaces)) {
      const workspacesObj = workspaces as Record<string, unknown>;
      const packages = workspacesObj["packages"];
      if (Array.isArray(packages)) {
        for (const pkg of packages) {
          if (typeof pkg === "string") patterns.push(pkg);
        }
      }
    }
  }

  return [...new Set(patterns)];
};

const expandPattern = (projectRoot: string, pattern: string): string[] => {
  const isGlob = pattern.endsWith("/*");
  const cleanPattern = pattern.replace(/\/\*$/, "");
  const basePath = path.join(projectRoot, cleanPattern);

  if (!fs.existsSync(basePath)) return [];

  if (!isGlob) {
    return fs.existsSync(path.join(basePath, "package.json")) ? [basePath] : [];
  }

  try {
    return fs
      .readdirSync(basePath, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && fs.existsSync(path.join(basePath, entry.name, "package.json")),
      )
      .map((entry) => path.join(basePath, entry.name));
  } catch {
    return [];
  }
};

const hasMonorepoMarkers = (projectRoot: string): boolean => {
  if (fs.existsSync(path.join(projectRoot, "pnpm-workspace.yaml"))) return true;
  if (fs.existsSync(path.join(projectRoot, "lerna.json"))) return true;

  const packageJson = readPackageJson(projectRoot);
  return Boolean(packageJson?.["workspaces"]);
};

const findWorkspaceProjects = (projectRoot: string): DetectedProject[] => {
  const patterns = getWorkspacePatterns(projectRoot);
  const projects: DetectedProject[] = [];

  for (const pattern of patterns) {
    for (const projectPath of expandPattern(projectRoot, pattern)) {
      const project = buildProject(projectPath);
      if (project) projects.push(project);
    }
  }

  return projects;
};

const scanDirectory = (
  directory: string,
  maxDepth: number,
  currentDepth: number = 0,
): DetectedProject[] => {
  if (currentDepth >= maxDepth || !fs.existsSync(directory)) return [];

  const projects: DetectedProject[] = [];

  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;

      const entryPath = path.join(directory, entry.name);
      const project = buildProject(entryPath);
      if (project) {
        projects.push(project);
        continue;
      }

      projects.push(...scanDirectory(entryPath, maxDepth, currentDepth + 1));
    }
  } catch {
    return projects;
  }

  return projects;
};

const scanSiblingProjects = (rootPath: string): DetectedProject[] => {
  const parentDir = path.join(rootPath, "..");
  const resolvedParent = path.resolve(parentDir);
  if (resolvedParent === rootPath) return [];

  const projects: DetectedProject[] = [];

  try {
    for (const entry of fs.readdirSync(resolvedParent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;

      const entryPath = path.join(resolvedParent, entry.name);
      if (path.resolve(entryPath) === rootPath) continue;

      const project = buildProject(entryPath);
      if (project) {
        projects.push(project);
        continue;
      }

      if (hasMonorepoMarkers(entryPath)) {
        projects.push(...findWorkspaceProjects(entryPath));
      }
    }
  } catch {
    return projects;
  }

  return projects;
};

export const detectNearbyProjects = (rootPath: string = process.cwd()): DetectedProject[] => {
  const resolvedRoot = path.resolve(rootPath);
  const projects: DetectedProject[] = [];
  const seenPaths = new Set<string>();

  const addProjects = (found: DetectedProject[]) => {
    for (const project of found) {
      const normalized = path.resolve(project.path);
      if (seenPaths.has(normalized)) continue;
      seenPaths.add(normalized);
      projects.push(project);
    }
  };

  const rootProject = buildProject(resolvedRoot);
  if (rootProject) addProjects([rootProject]);

  if (hasMonorepoMarkers(resolvedRoot)) {
    addProjects(findWorkspaceProjects(resolvedRoot));
  }

  if (projects.length === 0) {
    addProjects(scanDirectory(resolvedRoot, PROJECT_SCAN_MAX_DEPTH));
  }

  addProjects(scanSiblingProjects(resolvedRoot));

  return projects;
};
