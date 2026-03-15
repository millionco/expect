interface Project {
  title: string;
  description: string;
  features: string[];
  command: string;
  agentPrompt: string;
  skillInstall: string;
  githubUrl: string;
  docsUrl: string;
}

export const PROJECTS: Project[] = [
  {
    title: "testie",
    description: "change your code → testie tests it in a real browser",
    features: [
      "no playwright scripts",
      "no selectors to maintain",
      "just your git diff",
    ],
    command: "npx testie@latest",
    agentPrompt: "npx -y testie@latest -m 'test my current changes' -y",
    skillInstall: "npx skills add millionco/testie/testie-cli",
    githubUrl: "https://github.com/millionco/testie",
    docsUrl: "#",
  },
];
