import { create } from "zustand";

export type Screen =
  | "main"
  | "select-pr"
  | "saved-flow-picker"
  | "planning"
  | "review-plan"
  | "cookie-sync-confirm"
  | "testing"
  | "results"
  | "theme";

interface NavigationStore {
  screen: Screen;
  previousScreen: Screen;
  navigateTo: (screen: Screen) => void;
  setScreen: (screen: Screen) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  screen: "main",
  previousScreen: "main",
  navigateTo: (screen) => set((state) => ({ screen, previousScreen: state.screen })),
  setScreen: (screen) => set({ screen }),
}));
