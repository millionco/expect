import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";

const eventBuffer: eventWithTime[] = [];
let stopFn: (() => void) | undefined;

export const startRecording = (): void => {
  eventBuffer.length = 0;
  stopFn =
    record({
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
