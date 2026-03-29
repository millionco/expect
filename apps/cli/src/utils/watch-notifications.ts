import type { WatchEvent } from "@expect/supervisor";
import { playSoundAndNotify } from "./play-sound";

const NOTIFICATION_TITLE = "expect";

export const sendWatchNotification = (event: WatchEvent): Promise<void> | undefined => {
  if (event._tag === "RunCompleted") {
    const steps = event.executedPlan.steps ?? [];
    const failedCount = steps.filter((step) => step.status === "failed").length;
    const passedCount = steps.filter((step) => step.status === "passed").length;

    if (failedCount > 0) {
      return playSoundAndNotify({
        title: NOTIFICATION_TITLE,
        message: `Tests failed: ${failedCount} failed, ${passedCount} passed`,
      });
    }

    return playSoundAndNotify({
      title: NOTIFICATION_TITLE,
      message: `All ${passedCount} tests passed`,
    });
  }

  if (event._tag === "Error") {
    return playSoundAndNotify({
      title: NOTIFICATION_TITLE,
      message: "Watch run encountered an error",
    });
  }

  return undefined;
};
