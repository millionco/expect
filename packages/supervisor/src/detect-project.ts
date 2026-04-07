import { Effect, FileSystem, Schema } from "effect";
import * as path from "node:path";
import { FRAMEWORK_DEFAULT_PORTS } from "./constants";

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

const VITE_BASED_FRAMEWORKS = new Set<Framework>(["vite", "remix", "astro", "sveltekit"]);
const PORT_FLAG_REGEX = /(?:--port|-p)\s+(\d+)/;
const VITE_PORT_REGEX = /port\s*:\s*(\d+)/;

const DependencyMap = Schema.Record(Schema.String, Schema.String);

const PackageJsonSchema = Schema.Struct({
  dependencies: Schema.optionalKey(DependencyMap),
  devDependencies: Schema.optionalKey(DependencyMap),
  scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});

const PackageJsonFromString = Schema.fromJsonString(PackageJsonSchema);

type PackageJson = typeof PackageJsonSchema.Type;

const hasDependency = (packageJson: PackageJson, name: string): boolean =>
  Boolean(
    (packageJson.dependencies && name in packageJson.dependencies) ||
    (packageJson.devDependencies && name in packageJson.devDependencies),
  );

const detectFramework = (packageJson: PackageJson | undefined): Framework => {
  if (!packageJson) return "unknown";

  for (const [dependency, framework] of FRAMEWORK_DETECTION_ORDER) {
    if (hasDependency(packageJson, dependency)) return framework;
  }

  return "unknown";
};

const readPackageJson = Effect.fn("detectProject.readPackageJson")(function* (projectRoot: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const packageJsonPath = path.join(projectRoot, "package.json");

  const content = yield* fileSystem
    .readFileString(packageJsonPath)
    .pipe(Effect.catchTag("PlatformError", () => Effect.succeed(undefined)));

  if (!content) return undefined;

  return yield* Schema.decodeEffect(PackageJsonFromString)(content).pipe(
    Effect.catchTag("SchemaError", Effect.die),
  );
});

const detectPortFromDevScript = (packageJson: PackageJson | undefined): number | undefined => {
  if (!packageJson?.scripts) return undefined;
  const devScript = packageJson.scripts["dev"];
  if (!devScript) return undefined;
  const flagMatch = PORT_FLAG_REGEX.exec(devScript);
  if (flagMatch) return Number(flagMatch[1]);
  return undefined;
};

const detectPortFromViteConfig = Effect.fn("DetectProject.detectPortFromViteConfig")(function* (
  projectRoot: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;

  const entries = yield* fileSystem
    .readDirectory(projectRoot)
    .pipe(Effect.catchTag("PlatformError", () => Effect.succeed([] as string[])));

  const viteConfig = entries.find((entry) => entry.startsWith("vite.config."));
  if (!viteConfig) return undefined;

  const content = yield* fileSystem
    .readFileString(path.join(projectRoot, viteConfig))
    .pipe(Effect.catchTag("PlatformError", () => Effect.succeed(undefined)));

  if (!content) return undefined;

  const portMatch = VITE_PORT_REGEX.exec(content);
  if (portMatch) return Number(portMatch[1]);
  return undefined;
});

export const detectProject = Effect.fn("DetectProject.detectProject")(function* (
  projectRoot?: string,
) {
  const root = projectRoot ?? process.cwd();
  const packageJson = yield* readPackageJson(root);
  const framework = detectFramework(packageJson);
  const defaultPort = FRAMEWORK_DEFAULT_PORTS[framework] ?? 3000;

  const scriptPort = detectPortFromDevScript(packageJson);
  let customPort: number | undefined = scriptPort;

  if (!customPort && VITE_BASED_FRAMEWORKS.has(framework)) {
    customPort = yield* detectPortFromViteConfig(root);
  }

  return { framework, defaultPort, customPort } satisfies ProjectDetection;
});
