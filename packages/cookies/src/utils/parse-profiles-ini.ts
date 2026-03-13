export interface IniProfile {
  name: string;
  path: string;
  isRelative: boolean;
}

const INI_KEY_PREFIX = {
  name: "Name=",
  path: "Path=",
  isRelative: "IsRelative=",
};

const parseIniValue = (line: string, prefix: string): string | undefined =>
  line.startsWith(prefix) ? line.slice(prefix.length) : undefined;

export const parseProfilesIni = (content: string): IniProfile[] => {
  const rawSections = content.split(/^\[/m).slice(1);

  return rawSections
    .filter((section) => section.match(/^Profile\d+\]/))
    .map((section) => {
      let name = "";
      let profilePath = "";
      let isRelative = true;

      for (const rawLine of section.split("\n")) {
        const line = rawLine.trim();
        name = parseIniValue(line, INI_KEY_PREFIX.name) ?? name;
        profilePath = parseIniValue(line, INI_KEY_PREFIX.path) ?? profilePath;
        const relativeValue = parseIniValue(line, INI_KEY_PREFIX.isRelative);
        if (relativeValue !== undefined) {
          isRelative = relativeValue === "1";
        }
      }

      return { name, path: profilePath, isRelative };
    })
    .filter((profile) => Boolean(profile.name) && Boolean(profile.path));
};
