import type { AgentBackend } from "@expect/agent";
import { resolveChangesFor } from "../utils/resolve-changes-for";
import { useNavigationStore, Screen } from "../stores/use-navigation";
import { usePreferencesStore } from "../stores/use-preferences";
import { isValidBrowserMode } from "../utils/project-preferences-io";
import { renderApp } from "../program";

type Target = "unstaged" | "branch" | "changes";

interface WatchCommandOpts {
  message?: string;
  agent?: AgentBackend;
  target?: Target;
  verbose?: boolean;
  browserMode?: string;
  cdp?: string;
  profile?: string;
  noCookies?: boolean;
  url?: string[];
}

export const runWatchCommand = async (opts: WatchCommandOpts) => {
  const target: Target = opts.target ?? "changes";
  const { changesFor } = await resolveChangesFor(target);

  const instruction =
    opts.message ?? "Test all changes from main in the browser and verify they work correctly.";

  const browserMode = isValidBrowserMode(opts.browserMode) ? opts.browserMode : "headed";

  usePreferencesStore.setState({
    ...(opts.agent ? { agentBackend: opts.agent } : {}),
    verbose: opts.verbose ?? false,
    browserMode,
    browserHeaded: browserMode !== "headless",
    browserProfile: opts.profile,
    cdpUrl: opts.cdp,
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
