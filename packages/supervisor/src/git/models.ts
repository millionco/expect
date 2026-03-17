import { Schema } from "effect";

export class Branch extends Schema.Class<Branch>("@ami/Branch")({
  name: Schema.String,
  fullRef: Schema.String,
  authorName: Schema.OptionFromOptionalKey(Schema.String),
  authorEmail: Schema.OptionFromOptionalKey(Schema.String),
  subject: Schema.OptionFromOptionalKey(Schema.String),
  lastCommitTimestampMs: Schema.Number,
  isMyBranch: Schema.Boolean,
}) {}

export class FileStat extends Schema.Class<FileStat>("@ami/FileStat")({
  relativePath: Schema.String,
  added: Schema.Number,
  removed: Schema.Number,
}) {}
