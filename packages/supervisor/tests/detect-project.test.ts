import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectProject } from "../src/detect-project";

const run = (projectRoot: string) =>
  Effect.runPromise(detectProject(projectRoot).pipe(Effect.provide(NodeServices.layer)));

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "detect-project-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const writePackageJson = (content: Record<string, unknown>) => {
  writeFileSync(join(tempDir, "package.json"), JSON.stringify(content));
};

const writeFile = (relativePath: string, content: string) => {
  writeFileSync(join(tempDir, relativePath), content);
};

describe("detectProject", () => {
  it("returns unknown with default port when no package.json exists", async () => {
    const result = await run(tempDir);
    expect(result.framework).toBe("unknown");
    expect(result.defaultPort).toBe(3000);
    expect(result.customPort).toBeUndefined();
  });

  it("detects next framework", async () => {
    writePackageJson({ dependencies: { next: "14.0.0" } });
    const result = await run(tempDir);
    expect(result.framework).toBe("next");
    expect(result.defaultPort).toBe(3000);
  });

  it("detects vite framework", async () => {
    writePackageJson({ devDependencies: { vite: "5.0.0" } });
    const result = await run(tempDir);
    expect(result.framework).toBe("vite");
    expect(result.defaultPort).toBe(5173);
  });

  it("detects angular framework", async () => {
    writePackageJson({ dependencies: { "@angular/core": "17.0.0" } });
    const result = await run(tempDir);
    expect(result.framework).toBe("angular");
    expect(result.defaultPort).toBe(4200);
  });

  it("detects remix framework", async () => {
    writePackageJson({ dependencies: { "@remix-run/react": "2.0.0" } });
    const result = await run(tempDir);
    expect(result.framework).toBe("remix");
    expect(result.defaultPort).toBe(5173);
  });

  it("detects astro framework", async () => {
    writePackageJson({ dependencies: { astro: "4.0.0" } });
    const result = await run(tempDir);
    expect(result.framework).toBe("astro");
    expect(result.defaultPort).toBe(4321);
  });

  it("detects nuxt framework", async () => {
    writePackageJson({ dependencies: { nuxt: "3.0.0" } });
    const result = await run(tempDir);
    expect(result.framework).toBe("nuxt");
    expect(result.defaultPort).toBe(3000);
  });

  it("detects sveltekit framework", async () => {
    writePackageJson({ devDependencies: { "@sveltejs/kit": "2.0.0" } });
    const result = await run(tempDir);
    expect(result.framework).toBe("sveltekit");
    expect(result.defaultPort).toBe(5173);
  });

  it("detects gatsby framework", async () => {
    writePackageJson({ dependencies: { gatsby: "5.0.0" } });
    const result = await run(tempDir);
    expect(result.framework).toBe("gatsby");
    expect(result.defaultPort).toBe(8000);
  });

  it("detects create-react-app framework", async () => {
    writePackageJson({ dependencies: { "react-scripts": "5.0.0" } });
    const result = await run(tempDir);
    expect(result.framework).toBe("create-react-app");
    expect(result.defaultPort).toBe(3000);
  });

  it("prioritizes meta-frameworks over vite", async () => {
    writePackageJson({
      dependencies: { "@remix-run/react": "2.0.0" },
      devDependencies: { vite: "5.0.0" },
    });
    const result = await run(tempDir);
    expect(result.framework).toBe("remix");
  });

  it("detects custom port from --port flag in dev script", async () => {
    writePackageJson({
      devDependencies: { vite: "5.0.0" },
      scripts: { dev: "vite --port 8080" },
    });
    const result = await run(tempDir);
    expect(result.customPort).toBe(8080);
  });

  it("detects custom port from -p flag in dev script", async () => {
    writePackageJson({
      dependencies: { next: "14.0.0" },
      scripts: { dev: "next dev -p 4000" },
    });
    const result = await run(tempDir);
    expect(result.customPort).toBe(4000);
  });

  it("detects custom port from vite.config.ts", async () => {
    writePackageJson({ devDependencies: { vite: "5.0.0" } });
    writeFile("vite.config.ts", `export default defineConfig({ server: { port: 9000 } })`);
    const result = await run(tempDir);
    expect(result.customPort).toBe(9000);
  });

  it("detects custom port from vite.config.mjs", async () => {
    writePackageJson({ devDependencies: { vite: "5.0.0" } });
    writeFile("vite.config.mjs", `export default { server: { port: 7777 } }`);
    const result = await run(tempDir);
    expect(result.customPort).toBe(7777);
  });

  it("prefers dev script port over vite config port", async () => {
    writePackageJson({
      devDependencies: { vite: "5.0.0" },
      scripts: { dev: "vite --port 8080" },
    });
    writeFile("vite.config.ts", `export default defineConfig({ server: { port: 9000 } })`);
    const result = await run(tempDir);
    expect(result.customPort).toBe(8080);
  });

  it("does not scan vite config for non-vite frameworks", async () => {
    writePackageJson({ dependencies: { next: "14.0.0" } });
    writeFile("vite.config.ts", `export default defineConfig({ server: { port: 9000 } })`);
    const result = await run(tempDir);
    expect(result.customPort).toBeUndefined();
  });
});
