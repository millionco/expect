import type { eventWithTime } from "@posthog/rrweb";

export const startRecording = (): void => {};
export const stopRecording = (): void => {};
export const getEvents = (): eventWithTime[] => [];
export const getAllEvents = (): eventWithTime[] => [];
export const getEventCount = (): number => 0;
