import { Data, Schema } from "effect";
import { type ChangedFile, type CommitSummary } from "@browser-tester/shared/models";

export { type ChangedFile, type CommitSummary };

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

export type ChangesFor = Data.TaggedEnum<{
  WorkingTree: {};
  Branch: { mainBranch: string };
  Changes: { mainBranch: string };
  Commit: { hash: string };
}>;
export const ChangesFor = Data.taggedEnum<ChangesFor>();

export const formatFileStats = (fileStats: readonly FileStat[]): string =>
  fileStats.map((stat) => `  ${stat.relativePath} (+${stat.added} -${stat.removed})`).join("\n");
