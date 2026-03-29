import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FRAMEWORK_DEFAULT_PORTS, VITE_CONFIG_EXTENSIONS } from "./constants";

type Framework =
  | "next"
  | "vite"
  | "angular"
  | "remix"
  | "astro"
  | "nuxt"
  | "sveltekit"
  | "gatsby"
  | "create-react-app"
  | "unknown";

interface ProjectDetection {
  framework: Framework;
  defaultPort: number;
  customPort: number | undefined;
}

const readPackageJson = (projectRoot: string): Record<string, unknown> | undefined => {
  const packageJsonPath = join(projectRoot, "package.json");
  if (!existsSync(packageJsonPath)) return undefined;
  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  } catch {
    return undefined;
  }
};

const hasDependency = (packageJson: Record<string, unknown>, name: string): boolean => {
  const deps = packageJson["dependencies"];
  const devDeps = packageJson["devDependencies"];
  return Boolean(
    (deps && typeof deps === "object" && name in deps) ||
      (devDeps && typeof devDeps === "object" && name in devDeps),
  );
};

const FRAMEWORK_DETECTION_ORDER: Array<[string, Framework]> = [
  ["next", "next"],
  ["@angular/core", "angular"],
  ["@remix-run/react", "remix"],
  ["astro", "astro"],
  ["nuxt", "nuxt"],
  ["@sveltejs/kit", "sveltekit"],
  ["gatsby", "gatsby"],
  ["react-scripts", "create-react-app"],
  ["vite", "vite"],
];

export const detectFramework = (projectRoot: string): Framework => {
  const packageJson = readPackageJson(projectRoot);
  if (!packageJson) return "unknown";

  for (const [dependency, framework] of FRAMEWORK_DETECTION_ORDER) {
    if (hasDependency(packageJson, dependency)) return framework;
  }

  return "unknown";
};

const VITE_BASED_FRAMEWORKS = new Set<Framework>(["vite", "remix", "astro", "sveltekit"]);
const PORT_FLAG_REGEX = /(?:--port|-p)\s+(\d+)/;
const VITE_PORT_REGEX = /port\s*:\s*(\d+)/;

export const detectCustomPort = (
  projectRoot: string,
  framework: Framework,
): number | undefined => {
  const packageJson = readPackageJson(projectRoot);
  if (packageJson) {
    const scripts = packageJson["scripts"];
    if (scripts && typeof scripts === "object") {
      const devScript = (scripts as Record<string, unknown>)["dev"];
      if (typeof devScript === "string") {
        const flagMatch = PORT_FLAG_REGEX.exec(devScript);
        if (flagMatch) return Number(flagMatch[1]);
      }
    }
  }

  if (VITE_BASED_FRAMEWORKS.has(framework)) {
    for (const extension of VITE_CONFIG_EXTENSIONS) {
      const configPath = join(projectRoot, `vite.config.${extension}`);
      if (!existsSync(configPath)) continue;
      try {
        const content = readFileSync(configPath, "utf-8");
        const portMatch = VITE_PORT_REGEX.exec(content);
        if (portMatch) return Number(portMatch[1]);
      } catch {
        continue;
      }
    }
  }

  return undefined;
};

export const detectProject = (projectRoot?: string): ProjectDetection => {
  const root = projectRoot ?? process.cwd();
  const framework = detectFramework(root);
  const defaultPort = FRAMEWORK_DEFAULT_PORTS[framework] ?? 3000;
  const customPort = detectCustomPort(root, framework);

  return { framework, defaultPort, customPort };
};
