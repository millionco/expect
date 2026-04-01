import type { AgentBackend } from "@expect/agent";
import { resolveChangesFor } from "../utils/resolve-changes-for";
import { useNavigationStore, Screen } from "../stores/use-navigation";
import { usePreferencesStore } from "../stores/use-preferences";
import { renderApp } from "../program";

type Target = "unstaged" | "branch" | "changes";

interface WatchCommandOpts {
  message?: string;
  agent?: AgentBackend;
  target?: Target;
  verbose?: boolean;
  headed?: boolean;
  noCookies?: boolean;
  replayHost?: string;
  url?: string[];
}

export const runWatchCommand = async (opts: WatchCommandOpts) => {
  const target: Target = opts.target ?? "changes";
  const { changesFor } = await resolveChangesFor(target);

  const instruction =
    opts.message ?? "Test all changes from main in the browser and verify they work correctly.";

  usePreferencesStore.setState({
    ...(opts.agent ? { agentBackend: opts.agent } : {}),
    verbose: opts.verbose ?? false,
    browserHeaded: opts.headed ?? false,
    replayHost: opts.replayHost ?? "https://expect.dev",
  });

  useNavigationStore.setState({
    screen: Screen.Watch({
      changesFor,
      instruction,
      baseUrl: opts.url?.[0],
    }),
  });

  await renderApp(opts.agent ?? "claude");
};
