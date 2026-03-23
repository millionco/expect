import { Schema } from "effect";

export class SessionLoadError extends Schema.ErrorClass<SessionLoadError>("SessionLoadError")({
  _tag: Schema.tag("SessionLoadError"),
  path: Schema.String,
  cause: Schema.String,
}) {
  message = `Failed to load session from ${this.path}: ${this.cause}`;
}

export class ViewerPushError extends Schema.ErrorClass<ViewerPushError>("ViewerPushError")({
  _tag: Schema.tag("ViewerPushError"),
  url: Schema.String,
  cause: Schema.String,
}) {
  message = `Failed to push to viewer at ${this.url}: ${this.cause}`;
}

export class ViewerSourceNotFoundError extends Schema.ErrorClass<ViewerSourceNotFoundError>(
  "ViewerSourceNotFoundError",
)({
  _tag: Schema.tag("ViewerSourceNotFoundError"),
}) {
  message = "Viewer source not found at packages/videogen/viewer/";
}
