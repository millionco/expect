import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const notifySpy = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/utils/play-sound", () => ({
  notify: (...args: unknown[]) => notifySpy(...args),
}));

describe("watch notifications", () => {
  beforeAll(() => {
    vi.stubGlobal("__VERSION__", "test");
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not notify when notifications are disabled", async () => {
    const { usePreferencesStore } = await import("../src/stores/use-preferences");
    const { sendWatchIssueNotification } = await import("../src/utils/watch-notifications");

    usePreferencesStore.setState({ notifications: false });
    await sendWatchIssueNotification("A watched run failed");

    expect(notifySpy).not.toHaveBeenCalled();
  });

  it("sends an OS notification when notifications are enabled", async () => {
    const { usePreferencesStore } = await import("../src/stores/use-preferences");
    const { sendWatchIssueNotification } = await import("../src/utils/watch-notifications");

    usePreferencesStore.setState({ notifications: true });
    await sendWatchIssueNotification("A watched run failed with validation errors");

    expect(notifySpy).toHaveBeenCalledWith({
      title: "Expect watch detected issues",
      message: "A watched run failed with validation errors",
    });
  });

  it("truncates long notification messages", async () => {
    const { usePreferencesStore } = await import("../src/stores/use-preferences");
    const { sendWatchIssueNotification } = await import("../src/utils/watch-notifications");

    usePreferencesStore.setState({ notifications: true });
    await sendWatchIssueNotification("x".repeat(220));

    expect(notifySpy).toHaveBeenCalledWith({
      title: "Expect watch detected issues",
      message: `${"x".repeat(179)}...`,
    });
  });
});
