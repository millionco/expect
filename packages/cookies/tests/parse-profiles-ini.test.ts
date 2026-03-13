import { describe, expect, it } from "vitest";
import { parseProfilesIni } from "../src/utils/parse-profiles-ini.js";

describe("parseProfilesIni", () => {
  it("parses a single profile section", () => {
    const content = `[Profile0]
Name=default-release
IsRelative=1
Path=abc123.default-release`;

    const result = parseProfilesIni(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "default-release",
      path: "abc123.default-release",
      isRelative: true,
    });
  });

  it("parses multiple profile sections", () => {
    const content = `[General]
StartWithLastProfile=1

[Profile0]
Name=default-release
IsRelative=1
Path=abc123.default-release

[Profile1]
Name=work
IsRelative=1
Path=def456.work

[Profile2]
Name=testing
IsRelative=0
Path=/absolute/path/to/profile`;

    const result = parseProfilesIni(content);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("default-release");
    expect(result[1].name).toBe("work");
    expect(result[2].name).toBe("testing");
    expect(result[2].isRelative).toBe(false);
    expect(result[2].path).toBe("/absolute/path/to/profile");
  });

  it("skips non-profile sections", () => {
    const content = `[General]
StartWithLastProfile=1

[Install123ABC]
Default=abc123.default-release

[Profile0]
Name=default
IsRelative=1
Path=abc.default`;

    const result = parseProfilesIni(content);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("default");
  });

  it("skips profiles missing name", () => {
    const content = `[Profile0]
IsRelative=1
Path=abc.default`;

    const result = parseProfilesIni(content);
    expect(result).toHaveLength(0);
  });

  it("skips profiles missing path", () => {
    const content = `[Profile0]
Name=default
IsRelative=1`;

    const result = parseProfilesIni(content);
    expect(result).toHaveLength(0);
  });

  it("defaults isRelative to true when not specified", () => {
    const content = `[Profile0]
Name=default
Path=abc.default`;

    const result = parseProfilesIni(content);
    expect(result).toHaveLength(1);
    expect(result[0].isRelative).toBe(true);
  });

  it("handles IsRelative=0 as false", () => {
    const content = `[Profile0]
Name=absolute
IsRelative=0
Path=/home/user/.mozilla/firefox/custom`;

    const result = parseProfilesIni(content);
    expect(result[0].isRelative).toBe(false);
  });

  it("returns empty array for empty content", () => {
    expect(parseProfilesIni("")).toEqual([]);
  });

  it("returns empty array for content with no profile sections", () => {
    const content = `[General]
StartWithLastProfile=1

[Install123]
Default=abc.default`;

    expect(parseProfilesIni(content)).toEqual([]);
  });

  it("handles windows-style line endings", () => {
    const content = "[Profile0]\r\nName=default\r\nIsRelative=1\r\nPath=abc.default\r\n";

    const result = parseProfilesIni(content);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("default");
  });
});
