import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { projectPreferencesStorage } from "@expect/supervisor";

export type { BrowserMode } from "../utils/project-preferences-io";
export { isValidBrowserMode } from "../utils/project-preferences-io";
import type { BrowserMode } from "../utils/project-preferences-io";

interface ProjectPreferencesStore {
  browserMode: BrowserMode | undefined;
  cookieBrowserKeys: string[];
  lastBaseUrl: string | undefined;
  setBrowserMode: (mode: BrowserMode) => void;
  setCookieBrowserKeys: (keys: string[]) => void;
  clearCookieBrowserKeys: () => void;
  setLastBaseUrl: (url: string | undefined) => void;
}

export const useProjectPreferencesStore = create<ProjectPreferencesStore>()(
  persist(
    (set) => ({
      browserMode: undefined,
      cookieBrowserKeys: [],
      lastBaseUrl: undefined,
      setBrowserMode: (mode: BrowserMode) => set({ browserMode: mode }),
      setCookieBrowserKeys: (keys: string[]) => set({ cookieBrowserKeys: keys }),
      clearCookieBrowserKeys: () => set({ cookieBrowserKeys: [] }),
      setLastBaseUrl: (url: string | undefined) => set({ lastBaseUrl: url }),
    }),
    {
      name: "project-preferences",
      storage: createJSONStorage(() => projectPreferencesStorage),
    },
  ),
);
