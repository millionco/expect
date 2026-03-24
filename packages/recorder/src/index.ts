export { collectEvents, collectAllEvents, loadSession } from "./recorder";
export { evaluateRecorderRuntime } from "./utils/evaluate-runtime";
export { RecorderInjectionError, SessionLoadError } from "./errors";
export type { CollectResult } from "./types";
export {
  EVENT_COLLECT_INTERVAL_MS,
  REPLAY_PLAYER_WIDTH_PX,
  REPLAY_PLAYER_HEIGHT_PX,
} from "./constants";
export type { eventWithTime } from "@rrweb/types";
