import type { eventWithTime } from "@rrweb/types";

export interface CollectResult {
  readonly events: ReadonlyArray<eventWithTime>;
  readonly total: number;
}
