import Link from "next/link";
import { Banner } from "@/components/banner";
import { ProjectInfo } from "@/components/project-info";
import { CommandDisplay } from "@/components/command-display";
import { ActionButtons } from "@/components/action-buttons";
import { DemoContainer } from "@/components/demo-container";
import { TerminalDemo } from "@/components/terminal-demo";
import { ThemeToggle } from "@/components/theme-toggle";

const Home = () => {
  return (
    <div className="flex min-h-svh flex-col items-center">
      <Banner />
      <main className="flex w-full max-w-lg flex-col items-start gap-10 px-6 py-16">
        <ProjectInfo />
        <DemoContainer>
          <TerminalDemo />
        </DemoContainer>
        <CommandDisplay />
        <ActionButtons />
      </main>
      <footer className="mt-auto flex w-full max-w-lg items-center justify-between px-6 py-12 text-caption font-medium leading-5.75">
        <div className="flex items-center gap-5.75">
          <Link href="https://github.com/millionco/testie#readme" className="text-muted-foreground transition-none hover:text-foreground">
            Docs
          </Link>
        </div>
        <div className="flex items-center gap-3.75">
          <Link
            href="https://github.com/millionco/testie"
            className="text-muted-foreground transition-none hover:text-foreground"
          >
            GitHub
          </Link>
          <Link href="https://x.com/AidenYBai" className="text-muted-foreground transition-none hover:text-foreground">
            X
          </Link>
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
};

export default Home;
