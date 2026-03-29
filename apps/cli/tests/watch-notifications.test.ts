import { describe, expect, it } from "vite-plus/test";
import { WatchEvent } from "@expect/supervisor";
import { sendWatchNotification } from "../src/utils/watch-notifications";

describe("sendWatchNotification", () => {
  it("returns undefined for Polling event", () => {
    expect(sendWatchNotification(WatchEvent.Polling())).toBeUndefined();
  });

  it("returns undefined for ChangeDetected event", () => {
    expect(
      sendWatchNotification(WatchEvent.ChangeDetected({ fingerprint: "abc123" })),
    ).toBeUndefined();
  });

  it("returns undefined for Settling event", () => {
    expect(sendWatchNotification(WatchEvent.Settling())).toBeUndefined();
  });

  it("returns undefined for Assessing event", () => {
    expect(sendWatchNotification(WatchEvent.Assessing())).toBeUndefined();
  });

  it("returns undefined for RunStarting event", () => {
    expect(
      sendWatchNotification(WatchEvent.RunStarting({ fingerprint: "abc123" })),
    ).toBeUndefined();
  });

  it("returns undefined for Skipped event", () => {
    expect(sendWatchNotification(WatchEvent.Skipped({ fingerprint: "abc123" }))).toBeUndefined();
  });

  it("returns undefined for Stopped event", () => {
    expect(sendWatchNotification(WatchEvent.Stopped())).toBeUndefined();
  });
});
