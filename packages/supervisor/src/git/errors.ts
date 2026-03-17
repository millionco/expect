import { Schema } from "effect";

export class GitError extends Schema.ErrorClass<GitError>("GitError")({
  _tag: Schema.tag("GitError"),
  operation: Schema.String,
  cause: Schema.Defect,
}) {
  message = `Git error during "${this.operation}"`;
}

export class FindRepoRootError extends Schema.ErrorClass<FindRepoRootError>("FindRepoRootError")({
  _tag: Schema.tag("FindRepoRootError"),
  cause: Schema.Defect,
}) {
  message = "Could not find git repository root";
}
