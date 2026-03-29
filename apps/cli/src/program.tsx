import { render } from "ink";
import { QueryClientProvider } from "@tanstack/react-query";
import { RegistryProvider } from "@effect/atom-react";
import { Option } from "effect";
import { App } from "./components/app";
import { ALT_SCREEN_OFF, ALT_SCREEN_ON } from "./constants";
import type { AgentBackend } from "@expect/agent";
import { queryClient } from "./query-client";
import { setInkInstance } from "./utils/clear-ink-display";
import { agentProviderAtom } from "./data/runtime";
import { flushSession, trackSessionStarted } from "./utils/session-analytics";
import { usePreferencesStore } from "./stores/use-preferences";

const MOUSE_DISABLE = "\u001b[?1000l\u001b[?1006l";

export const renderApp = async (agent: AgentBackend) => {
  usePreferencesStore.getState().setAgentBackend(agent);
  const sessionStartedAt = Date.now();
  await trackSessionStarted();

  process.stdout.write(ALT_SCREEN_ON);
  process.on("exit", () => process.stdout.write(MOUSE_DISABLE + ALT_SCREEN_OFF));
  const instance = render(
    <RegistryProvider initialValues={[[agentProviderAtom, Option.some(agent)]]}>
      <QueryClientProvider client={queryClient}>
        <App agent={agent} />
      </QueryClientProvider>
    </RegistryProvider>,
  );
  setInkInstance(instance);
  await instance.waitUntilExit();
  await flushSession(sessionStartedAt);
  process.stdout.write(MOUSE_DISABLE + ALT_SCREEN_OFF);
  process.exit(0);
};
