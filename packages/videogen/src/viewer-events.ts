import { Schema } from "effect";

export class ViewerStepEvent extends Schema.Class<ViewerStepEvent>("@videogen/ViewerStepEvent")({
  stepId: Schema.String,
  title: Schema.String,
  status: Schema.Literal("pending", "active", "passed", "failed"),
  summary: Schema.UndefinedOr(Schema.String),
}) {}

export class ViewerRunState extends Schema.Class<ViewerRunState>("@videogen/ViewerRunState")({
  title: Schema.String,
  status: Schema.Literal("running", "passed", "failed"),
  summary: Schema.UndefinedOr(Schema.String),
  steps: Schema.Array(ViewerStepEvent),
}) {}
