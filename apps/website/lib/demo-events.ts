import type { eventWithTime } from "@posthog/rrweb";
import recordedDemoEvents from "@/lib/recorded-demo-events.json";

const demoEvents: eventWithTime[] = recordedDemoEvents.map((event) => event);

export const DEMO_EVENTS = demoEvents;
