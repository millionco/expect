import * as path from "node:path";
import { execFile } from "node:child_process";
import { Effect, FileSystem, Layer, ServiceMap } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { ChangedFile, TestCoverageReport } from "@expect/shared/models";
import { GitRepoRoot } from "./git/git";
import { SKIP_DIRECTORIES, SOURCE_EXTENSIONS, TEST_FILE_SCAN_LIMIT } from "./constants";

const IMPORT_PATTERNS = [
  /from\s+["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /require\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const TEST_FILE_PATTERN = /\.(?:test|spec|e2e)\.(?:ts|tsx|js|jsx|mts|mjs|cts|cjs)$/;
const TEST_DIRECTORY_PATTERN = /(?:^|[/\\])(?:__tests?__|tests?)[/\\]/;
const SOURCE_EXTENSION_PATTERN = /\.(?:ts|tsx|js|jsx|mts|mjs|cts|cjs)$/;

const isSourceFile = (filePath: string): boolean => {
  const extension = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.includes(extension);
};

const isInSkippedDirectory = (filePath: string): boolean => {
  const segments = filePath.split(/[/\\]/);
  return segments.some((segment) => SKIP_DIRECTORIES.has(segment));
};

const matchesTestFile = (filePath: string): boolean => {
  if (TEST_FILE_PATTERN.test(filePath)) return true;
  if (TEST_DIRECTORY_PATTERN.test(filePath) && SOURCE_EXTENSION_PATTERN.test(filePath)) return true;
  return false;
};

const extractImportSpecifiers = (content: string): string[] => {
  const specifiers: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const specifier = match[1];
      if (specifier) specifiers.push(specifier);
    }
  }
  return specifiers;
};

const getTransitiveDependencies = (
  edges: ReadonlyMap<string, ReadonlySet<string>>,
  startFile: string,
): Set<string> => {
  const visited = new Set<string>();
  const queue = [startFile];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = edges.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) queue.push(dep);
      }
    }
  }

  visited.delete(startFile);
  return visited;
};

const listTrackedFiles = (repoRoot: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<string[]>((resolve) => {
        execFile(
          "git",
          ["ls-files", "--cached", "--others", "--exclude-standard"],
          { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
          (error, stdout) => {
            if (error) {
              resolve([]);
              return;
            }
            resolve(
              stdout
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0),
            );
          },
        );
      }),
    catch: () => [] as string[],
  });

interface ModuleResolver {
  sync(directory: string, specifier: string): { path?: string | null };
}

const createResolver = async (rootDir: string): Promise<ModuleResolver | undefined> => {
  try {
    const { ResolverFactory } = await import("oxc-resolver");
    return new ResolverFactory({
      tsconfig: {
        configFile: path.join(rootDir, "tsconfig.json"),
        references: "auto",
      },
      extensions: [...SOURCE_EXTENSIONS],
      mainFields: ["module", "main"],
      conditionNames: ["import", "require", "default"],
    });
  } catch {
    return undefined;
  }
};

const resolveSpecifier = (
  resolver: ModuleResolver,
  directory: string,
  specifier: string,
): string | undefined => {
  try {
    const resolved = resolver.sync(directory, specifier);
    return resolved.path ?? undefined;
  } catch {
    return undefined;
  }
};

const buildImportGraph = (
  rootDir: string,
  allFiles: readonly string[],
  fileSystem: FileSystem.FileSystem,
) =>
  Effect.gen(function* () {
    const sourceFiles = allFiles.filter(
      (filePath) => isSourceFile(filePath) && !isInSkippedDirectory(filePath),
    );

    const resolver = yield* Effect.promise(() => createResolver(rootDir));
    if (!resolver) return new Map() as ReadonlyMap<string, ReadonlySet<string>>;

    const edges = new Map<string, Set<string>>();

    yield* Effect.forEach(
      sourceFiles,
      (relativePath) =>
        Effect.gen(function* () {
          const fullPath = path.join(rootDir, relativePath);
          const content = yield* fileSystem
            .readFileString(fullPath)
            .pipe(Effect.catchTag("PlatformError", () => Effect.succeed("")));

          if (!content) return;

          const specifiers = extractImportSpecifiers(content);
          const deps = new Set<string>();

          for (const specifier of specifiers) {
            if (
              specifier.startsWith(".") ||
              specifier.startsWith("@") ||
              specifier.startsWith("~")
            ) {
              const directory = path.dirname(fullPath);
              const resolvedPath = resolveSpecifier(resolver, directory, specifier);
              if (resolvedPath) {
                const resolvedRelative = path.relative(rootDir, resolvedPath);
                if (!isInSkippedDirectory(resolvedRelative)) {
                  deps.add(resolvedRelative);
                }
              }
            }
          }

          if (deps.size > 0) {
            edges.set(relativePath, deps);
          }
        }),
      { concurrency: 50 },
    );

    return edges as ReadonlyMap<string, ReadonlySet<string>>;
  });

const findTestFiles = (allFiles: readonly string[]): readonly string[] =>
  allFiles
    .filter((filePath) => !isInSkippedDirectory(filePath) && matchesTestFile(filePath))
    .slice(0, TEST_FILE_SCAN_LIMIT);

export class TestCoverage extends ServiceMap.Service<TestCoverage>()("@supervisor/TestCoverage", {
  make: Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    const analyze = Effect.fn("TestCoverage.analyze")(function* (
      changedFiles: readonly ChangedFile[],
    ) {
      yield* Effect.annotateCurrentSpan({ changedFileCount: changedFiles.length });

      const repoRoot = yield* GitRepoRoot;
      const allFiles = yield* listTrackedFiles(repoRoot);

      const testFilePaths = findTestFiles(allFiles);
      const edges = yield* buildImportGraph(repoRoot, allFiles, fileSystem);

      const coveredBy = new Map<string, string[]>();
      for (const testFilePath of testFilePaths) {
        const closure = getTransitiveDependencies(edges, testFilePath);
        closure.add(testFilePath);
        for (const dep of closure) {
          const existing = coveredBy.get(dep) ?? [];
          existing.push(testFilePath);
          coveredBy.set(dep, existing);
        }
      }

      const sourceFiles = changedFiles.filter(
        (file) =>
          SOURCE_EXTENSION_PATTERN.test(file.path) && !matchesTestFile(file.path) && file.status !== "D",
      );

      const entries = sourceFiles.map((file) => {
        const matchedTests = coveredBy.get(file.path) ?? [];
        return {
          path: file.path,
          testFiles: matchedTests,
          covered: matchedTests.length > 0,
        };
      });

      const coveredCount = entries.filter((entry) => entry.covered).length;
      const totalCount = sourceFiles.length;
      const percent = totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 100;

      yield* Effect.logInfo("Test coverage analyzed", {
        coveredCount,
        totalCount,
        percent,
        testFileCount: testFilePaths.length,
        graphEdgeCount: edges.size,
      });

      return { entries, coveredCount, totalCount, percent } satisfies TestCoverageReport;
    });

    return { analyze } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
