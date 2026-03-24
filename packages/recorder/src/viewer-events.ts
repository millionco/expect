import { Schema } from "effect";

export interface ViewerStepEvent {
  readonly stepId: string;
  readonly title: string;
  readonly status: "pending" | "active" | "passed" | "failed";
  readonly summary: string | undefined;
}

export const ViewerStepEventSchema = Schema.Struct({
  stepId: Schema.String,
  title: Schema.String,
  status: Schema.Union([
    Schema.Literal("pending"),
    Schema.Literal("active"),
    Schema.Literal("passed"),
    Schema.Literal("failed"),
  ]),
  summary: Schema.optional(Schema.String),
});

export interface ViewerRunState {
  readonly title: string;
  readonly status: "running" | "passed" | "failed";
  readonly summary: string | undefined;
  readonly steps: readonly ViewerStepEvent[];
}

export const ViewerRunStateSchema = Schema.Struct({
  title: Schema.String,
  status: Schema.Union([
    Schema.Literal("running"),
    Schema.Literal("passed"),
    Schema.Literal("failed"),
  ]),
  summary: Schema.optional(Schema.String),
  steps: Schema.Array(ViewerStepEventSchema),
});
