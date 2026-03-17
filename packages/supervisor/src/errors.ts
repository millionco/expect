import { Cause, Schema } from "effect";

const formatCause = (cause: unknown): string =>
  Cause.isCause(cause) ? Cause.pretty(cause) : String(cause);

export class PlanningError extends Schema.ErrorClass<PlanningError>("PlanningError")({
  _tag: Schema.tag("PlanningError"),
  stage: Schema.NonEmptyString,
  cause: Schema.Unknown,
}) {
  message = `Browser flow planning failed during ${this.stage}: ${formatCause(this.cause)}`;
}

export class PlanParseError extends Schema.ErrorClass<PlanParseError>("PlanParseError")({
  _tag: Schema.tag("PlanParseError"),
  stage: Schema.NonEmptyString,
  cause: Schema.Unknown,
}) {
  message = `Browser flow plan parsing failed during ${this.stage}: ${formatCause(this.cause)}`;
}

export class ExecutionError extends Schema.ErrorClass<ExecutionError>("ExecutionError")({
  _tag: Schema.tag("ExecutionError"),
  stage: Schema.NonEmptyString,
  cause: Schema.Unknown,
}) {
  message = `Browser flow execution failed during ${this.stage}: ${formatCause(this.cause)}`;
}
