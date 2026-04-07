import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), "tar-test-"));
  });

  afterEach(() => {
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  it("extracts files matching the prefix", () => {
    const tar = buildTar([
      { name: "repo-main/packages/skill/README.md", content: "# Skill" },
      { name: "repo-main/packages/skill/SKILL.md", content: "skill content" },
    ]);

    extractTarEntries(tar, "repo-main/packages/skill/", destDir);

    expect(fs.readFileSync(path.join(destDir, "README.md"), "utf8")).toBe("# Skill");
    expect(fs.readFileSync(path.join(destDir, "SKILL.md"), "utf8")).toBe("skill content");
  });

  it("skips files outside the prefix", () => {
    const tar = buildTar([
      { name: "repo-main/packages/other/file.txt", content: "other" },
      { name: "repo-main/packages/skill/keep.txt", content: "keep" },
    ]);

    extractTarEntries(tar, "repo-main/packages/skill/", destDir);

    const files = fs.readdirSync(destDir, { recursive: true });
    expect(files).toEqual(["keep.txt"]);
  });

  it("creates nested directories", () => {
    const tar = buildTar([{ name: "prefix/sub/dir/file.txt", content: "nested" }]);

    extractTarEntries(tar, "prefix/", destDir);

    expect(fs.readFileSync(path.join(destDir, "sub", "dir", "file.txt"), "utf8")).toBe("nested");
  });

  it("handles empty tar archive", () => {
    const tar = Buffer.alloc(TAR_HEADER_SIZE * 2);
    extractTarEntries(tar, "prefix/", destDir);

    expect(fs.readdirSync(destDir)).toEqual([]);
  });
});

describe("skill copy installation", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "expect-skill-link-"));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("refreshes an existing expect skill directory with a copied version", () => {
    const sharedSkillDir = path.join(projectRoot, ".agents", "skills", "expect");
    const codexSkillsDir = path.join(projectRoot, ".codex", "skills");
    const legacySkillDir = path.join(codexSkillsDir, "expect");

    fs.mkdirSync(sharedSkillDir, { recursive: true });
    fs.mkdirSync(legacySkillDir, { recursive: true });
    fs.writeFileSync(path.join(sharedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");
    fs.writeFileSync(path.join(legacySkillDir, "SKILL.md"), "---\nname: expect\nold\n---\n");

    expect(ensureAgentSkillCopy(projectRoot, "codex")).toBe("copied");

    const stats = fs.lstatSync(legacySkillDir);
    expect(stats.isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(legacySkillDir, "SKILL.md"), "utf8")).toBe(
      "---\nname: expect\n---\n",
    );
  });

  it("refuses to replace non-skill directories at the expect skill path", () => {
    const sharedSkillDir = path.join(projectRoot, ".agents", "skills", "expect");
    const cursorSkillsDir = path.join(projectRoot, ".cursor", "skills");
    const unrelatedSkillDir = path.join(cursorSkillsDir, "expect");

    fs.mkdirSync(sharedSkillDir, { recursive: true });
    fs.mkdirSync(unrelatedSkillDir, { recursive: true });
    fs.writeFileSync(path.join(sharedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");
    fs.writeFileSync(path.join(unrelatedSkillDir, "README.md"), "custom");

    const result = ensureAgentSkillCopy(projectRoot, "cursor");
    expect(result).toContain("is not an expect skill directory");
    expect(fs.lstatSync(unrelatedSkillDir).isDirectory()).toBe(true);
  });

  it("replaces stale skill directories that contain SKILL.md", () => {
    const sharedSkillDir = path.join(projectRoot, ".agents", "skills", "expect");
    const cursorSkillsDir = path.join(projectRoot, ".cursor", "skills");
    const staleSkillDir = path.join(cursorSkillsDir, "expect");

    fs.mkdirSync(sharedSkillDir, { recursive: true });
    fs.mkdirSync(staleSkillDir, { recursive: true });
    fs.writeFileSync(path.join(sharedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");
    fs.writeFileSync(path.join(staleSkillDir, "SKILL.md"), "old content");

    expect(ensureAgentSkillCopy(projectRoot, "cursor")).toBe("copied");
    expect(fs.lstatSync(staleSkillDir).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(staleSkillDir, "SKILL.md"), "utf8")).toBe(
      "---\nname: expect\n---\n",
    );
  });

  it("keeps existing matching copied skill directories untouched", () => {
    const sharedSkillDir = path.join(projectRoot, ".agents", "skills", "expect");
    const opencodeSkillsDir = path.join(projectRoot, ".opencode", "skills");
    const installedSkillDir = path.join(opencodeSkillsDir, "expect");

    fs.mkdirSync(sharedSkillDir, { recursive: true });
    fs.mkdirSync(opencodeSkillsDir, { recursive: true });
    fs.writeFileSync(path.join(sharedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");
    fs.mkdirSync(installedSkillDir, { recursive: true });
    fs.writeFileSync(path.join(installedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");

    expect(ensureAgentSkillCopy(projectRoot, "opencode")).toBe("already-copied");
  });

  it("replaces symlinks with fresh copied skill directories", () => {
    const sharedSkillDir = path.join(projectRoot, ".agents", "skills", "expect");
    const cursorSkillsDir = path.join(projectRoot, ".cursor", "skills");
    const symlinkPath = path.join(cursorSkillsDir, "expect");

    fs.mkdirSync(sharedSkillDir, { recursive: true });
    fs.mkdirSync(cursorSkillsDir, { recursive: true });
    fs.writeFileSync(path.join(sharedSkillDir, "SKILL.md"), "---\nname: expect\n---\n");
    fs.symlinkSync("../../missing/expect", symlinkPath);

    expect(ensureAgentSkillCopy(projectRoot, "cursor")).toBe("copied");
    expect(fs.lstatSync(symlinkPath).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(symlinkPath, "SKILL.md"), "utf8")).toBe(
      "---\nname: expect\n---\n",
    );
  });
});
