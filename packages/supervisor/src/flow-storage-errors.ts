import { Schema } from "effect";

export class FlowNotFoundError extends Schema.ErrorClass<FlowNotFoundError>("FlowNotFoundError")({
  _tag: Schema.tag("FlowNotFoundError"),
  lookupType: Schema.Literals(["slug", "filePath"] as const),
  lookupValue: Schema.NonEmptyString,
}) {
  message = `Saved flow not found for ${this.lookupType}: ${this.lookupValue}`;
}

export class FlowParseError extends Schema.ErrorClass<FlowParseError>("FlowParseError")({
  _tag: Schema.tag("FlowParseError"),
  filePath: Schema.NonEmptyString,
}) {
  message = `Saved flow file is invalid: ${this.filePath}`;
}

export class FlowStorageError extends Schema.ErrorClass<FlowStorageError>("FlowStorageError")({
  _tag: Schema.tag("FlowStorageError"),
  operation: Schema.NonEmptyString,
  filePath: Schema.NonEmptyString,
  cause: Schema.Unknown,
}) {
  message = `Failed to ${this.operation} at ${this.filePath}: ${String(this.cause)}`;
}
