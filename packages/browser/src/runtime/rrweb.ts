import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";

const RRWEB_CHECKOUT_INTERVAL_MS = 10_000;

const eventBuffer: eventWithTime[] = [];
let stopFn: (() => void) | undefined;

export const startRecording = (): void => {
  if (stopFn) return;
  eventBuffer.length = 0;
  stopFn =
    record({
      checkoutEveryNms: RRWEB_CHECKOUT_INTERVAL_MS,
      sampling: { input: "last" },
      emit(event) {
        eventBuffer.push(event);
      },
    }) ?? undefined;
};

export const stopRecording = (): void => {
  stopFn?.();
  stopFn = undefined;
};

export const getEvents = (): eventWithTime[] => {
  return eventBuffer.splice(0);
};

export const getAllEvents = (): eventWithTime[] => {
  return [...eventBuffer];
};

export const getEventCount = (): number => {
  return eventBuffer.length;
};
