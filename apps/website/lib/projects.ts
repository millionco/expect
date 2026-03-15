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
    description: "Testie lets coding agents test your code changes in a real browser.",
    features: ["Describe what to test → an agent handles the rest."],
    command: "npx testie@latest",
    agentPrompt: "npx -y testie@latest -m 'test my current changes' -y",
    skillInstall: "npx skills add millionco/testie/testie-cli",
    githubUrl: "https://github.com/millionco/testie",
    docsUrl: "https://github.com/millionco/testie#readme",
  },
];
