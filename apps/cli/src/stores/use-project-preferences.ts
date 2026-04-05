import { Schema } from "effect";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { projectPreferencesStorage } from "@expect/supervisor";
import { type Browser, Browser as BrowserSchema } from "@expect/cookies";

const decodeBrowsers = Schema.decodeUnknownSync(Schema.Array(BrowserSchema));

interface ProjectPreferencesStore {
  cookieImportProfiles: readonly Browser[];
  setCookieImportProfiles: (profiles: readonly Browser[]) => void;
  clearCookieImportProfiles: () => void;
  lastBaseUrl: string | undefined;
  setLastBaseUrl: (url: string | undefined) => void;
}

export const useProjectPreferencesStore = create<ProjectPreferencesStore>()(
  persist(
    (set) => ({
      cookieImportProfiles: [],
      setCookieImportProfiles: (profiles: readonly Browser[]) =>
        set({ cookieImportProfiles: profiles }),
      clearCookieImportProfiles: () => set({ cookieImportProfiles: [] }),
      lastBaseUrl: undefined,
      setLastBaseUrl: (url: string | undefined) => set({ lastBaseUrl: url }),
    }),
    {
      name: "project-preferences",
      storage: createJSONStorage(() => projectPreferencesStorage),
      merge: (persisted, current) => {
        const state = persisted as Partial<ProjectPreferencesStore> | undefined;
        const profiles = state?.cookieImportProfiles;
        return {
          ...current,
          ...state,
          cookieImportProfiles: profiles ? decodeBrowsers(profiles) : [],
        };
      },
    },
  ),
);
