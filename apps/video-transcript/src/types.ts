export interface ActivitySegment {
  readonly type: "active" | "idle" | "scene_change";
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export type ActivityTimeline = readonly ActivitySegment[];
