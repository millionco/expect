import { notify } from "./play-sound";
import { usePreferencesStore } from "../stores/use-preferences";

const NOTIFICATION_MESSAGE_LIMIT = 180;

const truncateMessage = (message: string) =>
  message.length > NOTIFICATION_MESSAGE_LIMIT
    ? `${message.slice(0, NOTIFICATION_MESSAGE_LIMIT - 1).trimEnd()}...`
    : message;

export const sendWatchIssueNotification = async (message: string) => {
  if (usePreferencesStore.getState().notifications !== true) return;

  await notify({
    title: "Expect watch detected issues",
    message: truncateMessage(message),
  });
};
