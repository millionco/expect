import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vite-plus/test";
import {
  ensureAgentSkillCopy,
  extractTarEntries,
  readNullTerminated,
} from "../src/commands/add-skill";

const TAR_HEADER_SIZE = 512;

const buildTarEntry = (name: string, content: string): Buffer => {
  const data = Buffer.from(content, "utf8");
  const header = Buffer.alloc(TAR_HEADER_SIZE);

  header.write(name, 0, Math.min(name.length, 100), "utf8");

  const sizeOctal = data.length.toString(8).padStart(11, "0");
  header.write(sizeOctal, 124, 12, "utf8");

  header[156] = 48;

  let checksum = 0;
  for (let index = 0; index < TAR_HEADER_SIZE; index++) {
    checksum += index >= 148 && index < 156 ? 32 : header[index];
  }
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");

  const paddedSize = Math.ceil(data.length / TAR_HEADER_SIZE) * TAR_HEADER_SIZE;
  const dataBlock = Buffer.alloc(paddedSize);
  data.copy(dataBlock);

  return Buffer.concat([header, dataBlock]);
};

const buildTar = (entries: Array<{ name: string; content: string }>): Buffer => {
  const blocks = entries.map((entry) => buildTarEntry(entry.name, entry.content));
  const endOfArchive = Buffer.alloc(TAR_HEADER_SIZE * 2);
  return Buffer.concat([...blocks, endOfArchive]);
};

describe("readNullTerminated", () => {
  it("reads a string terminated by null bytes", () => {
    const buffer = Buffer.alloc(16);
    buffer.write("hello", 0, "utf8");
    expect(readNullTerminated(buffer, 0, 16)).toBe("hello");
  });

  it("reads a string that fills the entire field", () => {
    const buffer = Buffer.from("abcde");
    expect(readNullTerminated(buffer, 0, 5)).toBe("abcde");
  });

  it("reads from an offset", () => {
    const buffer = Buffer.alloc(20);
    buffer.write("skip", 0, "utf8");
    buffer.write("read", 10, "utf8");
    expect(readNullTerminated(buffer, 10, 10)).toBe("read");
  });
});

describe("extractTarEntries", () => {
  let destDir: string;

  beforeEach(() => {
    destDir = mkdtempSync(join(tmpdir(), "tar-test-"));
  });

  afterEach(() => {
    rmSync(destDir, { recursive: true, force: true });
  });

  it("extracts files matching the prefix", () => {
    const tar = buildTar([
      { name: "repo-main/packages/skill/README.md", content: "# Skill" },
      { name: "repo-main/packages/skill/SKILL.md", content: "skill content" },
    ]);

    extractTarEntries(tar, "repo-main/packages/skill/", destDir);

    expect(readFileSync(join(destDir, "README.md"), "utf8")).toBe("# Skill");
    expect(readFileSync(join(destDir, "SKILL.md"), "utf8")).toBe("skill content");
  });

  it("skips files outside the prefix", () => {
    const tar = buildTar([
      { name: "repo-main/packages/other/file.txt", content: "other" },
      { name: "repo-main/packages/skill/keep.txt", content: "keep" },
    ]);

    extractTarEntries(tar, "repo-main/packages/skill/", destDir);

    const files = readdirSync(destDir, { recursive: true });
    expect(files).toEqual(["keep.txt"]);
  });

  it("creates nested directories", () => {
    const tar = buildTar([{ name: "prefix/sub/dir/file.txt", content: "nested" }]);

    extractTarEntries(tar, "prefix/", destDir);

    expect(readFileSync(join(destDir, "sub", "dir", "file.txt"), "utf8")).toBe("nested");
  });

  it("handles empty tar archive", () => {
    const tar = Buffer.alloc(TAR_HEADER_SIZE * 2);
    extractTarEntries(tar, "prefix/", destDir);

    expect(readdirSync(destDir)).toEqual([]);
  });
});

describe("skill copy installation", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "expect-skill-link-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("refreshes an existing expect skill directory with a copied version", () => {
    const sharedSkillDir = join(projectRoot, ".agents", "skills", "expect");
    const codexSkillsDir = join(projectRoot, ".codex", "skills");
    const legacySkillDir = join(codexSkillsDir, "expect");

    mkdirSync(sharedSkillDir, { recursive: true });
    mkdirSync(legacySkillDir, { recursive: true });
    writeFileSync(join(sharedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");
    writeFileSync(join(legacySkillDir, "SKILL.md"), "---\nname: expect\nold\n---\n");

    expect(ensureAgentSkillCopy(projectRoot, "codex")).toBe("copied");

    const stats = lstatSync(legacySkillDir);
    expect(stats.isDirectory()).toBe(true);
    expect(readFileSync(join(legacySkillDir, "SKILL.md"), "utf8")).toBe("---\nname: expect\n---\n");
  });

  it("refuses to replace non-skill directories at the expect skill path", () => {
    const sharedSkillDir = join(projectRoot, ".agents", "skills", "expect");
    const cursorSkillsDir = join(projectRoot, ".cursor", "skills");
    const unrelatedSkillDir = join(cursorSkillsDir, "expect");

    mkdirSync(sharedSkillDir, { recursive: true });
    mkdirSync(unrelatedSkillDir, { recursive: true });
    writeFileSync(join(sharedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");
    writeFileSync(join(unrelatedSkillDir, "README.md"), "custom");

    const result = ensureAgentSkillCopy(projectRoot, "cursor");
    expect(result).toContain("is not an expect skill directory");
    expect(lstatSync(unrelatedSkillDir).isDirectory()).toBe(true);
  });

  it("replaces stale skill directories that contain SKILL.md", () => {
    const sharedSkillDir = join(projectRoot, ".agents", "skills", "expect");
    const cursorSkillsDir = join(projectRoot, ".cursor", "skills");
    const staleSkillDir = join(cursorSkillsDir, "expect");

    mkdirSync(sharedSkillDir, { recursive: true });
    mkdirSync(staleSkillDir, { recursive: true });
    writeFileSync(join(sharedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");
    writeFileSync(join(staleSkillDir, "SKILL.md"), "old content");

    expect(ensureAgentSkillCopy(projectRoot, "cursor")).toBe("copied");
    expect(lstatSync(staleSkillDir).isDirectory()).toBe(true);
    expect(readFileSync(join(staleSkillDir, "SKILL.md"), "utf8")).toBe("---\nname: expect\n---\n");
  });

  it("keeps existing matching copied skill directories untouched", () => {
    const sharedSkillDir = join(projectRoot, ".agents", "skills", "expect");
    const opencodeSkillsDir = join(projectRoot, ".opencode", "skills");
    const installedSkillDir = join(opencodeSkillsDir, "expect");

    mkdirSync(sharedSkillDir, { recursive: true });
    mkdirSync(opencodeSkillsDir, { recursive: true });
    writeFileSync(join(sharedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");
    mkdirSync(installedSkillDir, { recursive: true });
    writeFileSync(join(installedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");

    expect(ensureAgentSkillCopy(projectRoot, "opencode")).toBe("already-copied");
  });

  it("replaces symlinks with fresh copied skill directories", () => {
    const sharedSkillDir = join(projectRoot, ".agents", "skills", "expect");
    const cursorSkillsDir = join(projectRoot, ".cursor", "skills");
    const symlinkPath = join(cursorSkillsDir, "expect");

    mkdirSync(sharedSkillDir, { recursive: true });
    mkdirSync(cursorSkillsDir, { recursive: true });
    writeFileSync(join(sharedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");
    symlinkSync("../../missing/expect", symlinkPath);

    expect(ensureAgentSkillCopy(projectRoot, "cursor")).toBe("copied");
    expect(lstatSync(symlinkPath).isDirectory()).toBe(true);
    expect(readFileSync(join(symlinkPath, "SKILL.md"), "utf8")).toBe("---\nname: expect\n---\n");
  });
});
