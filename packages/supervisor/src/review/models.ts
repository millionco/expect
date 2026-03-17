import { Option, Schema } from "effect";
import { Model } from "effect/unstable/schema";

// ── IDs ─────────────────────────────────────────────────────────────

export const CommentId = Schema.String.pipe(Schema.brand("CommentId"));
export type CommentId = typeof CommentId.Type;

export const CommitHash = Schema.String.pipe(Schema.brand("CommitHash"));
export type CommitHash = typeof CommitHash.Type;

// ── Errors ──────────────────────────────────────────────────────────

export class CommentNotFoundError extends Schema.ErrorClass<CommentNotFoundError>(
  "CommentNotFoundError",
)({
  _tag: Schema.tag("CommentNotFoundError"),
  commentId: Schema.Union([CommentId, CommitHash]),
}) {
  message = `Comment not found: ${this.commentId}`;
}

export class CommitNotFoundError extends Schema.ErrorClass<CommitNotFoundError>(
  "CommitNotFoundError",
)({
  _tag: Schema.tag("CommitNotFoundError"),
  commitHash: CommitHash,
}) {
  message = `Commit not found: ${this.commitHash}`;
}

// ── CodeRange ───────────────────────────────────────────────────────

export class CodeRange extends Schema.Class<CodeRange>("CodeRange")({
  startLine: Schema.Int,
  endLine: Schema.Int,
}) {
  static singleLine(lineNumber: number) {
    return new CodeRange({ startLine: lineNumber, endLine: lineNumber });
  }
}

// ── Comment ─────────────────────────────────────────────────────────

export class TextComment extends Schema.Class<TextComment>("@ami/TextComment")({
  _tag: Schema.tag("TextComment"),
  relativePath: Schema.String,
  range: CodeRange,
  text: Schema.String,
}) {
  static equivalence = Schema.toEquivalence(this);
}

export const CommentValue = Schema.Union([TextComment]);
export type CommentValue = typeof CommentValue.Type;

export class Comment extends Model.Class<Comment>("@ami/Comment")({
  id: Model.GeneratedByApp(CommentId),
  commitHash: CommitHash,
  value: Model.JsonFromString(Schema.Array(CommentValue)),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}

// ── GitFileStatus ───────────────────────────────────────────────────

export const GitFileStatus = Schema.Literals([
  "Modified",
  "Added",
  "Deleted",
  "TypeChanged",
  "Renamed",
  "Copied",
  "Unmerged",
  "Untracked",
]);
export type GitFileStatus = typeof GitFileStatus.Type;

// ── ChangeType ──────────────────────────────────────────────────────

export class IndexChange extends Schema.Class<IndexChange>("@ami/IndexChange")({
  _tag: Schema.tag("Index"),
  status: GitFileStatus,
  relativePath: Schema.String,
  absoluteFilePath: Schema.String,
  previousPath: Schema.optional(Schema.String),
}) {}

export class WorkingTreeChange extends Schema.Class<WorkingTreeChange>("@ami/WorkingTreeChange")({
  _tag: Schema.tag("WorkingTree"),
  status: GitFileStatus,
  relativePath: Schema.String,
  absoluteFilePath: Schema.String,
  previousPath: Schema.optional(Schema.String),
}) {}

export class CommittedChange extends Schema.Class<CommittedChange>("@ami/CommittedChange")({
  _tag: Schema.tag("Committed"),
  status: GitFileStatus,
  relativePath: Schema.String,
  absoluteFilePath: Schema.String,
  previousPath: Schema.optional(Schema.String),
}) {}

export const ChangeType = Schema.Union([IndexChange, WorkingTreeChange, CommittedChange]);
export type ChangeType = typeof ChangeType.Type;

// ── FileContent ─────────────────────────────────────────────────────

export class Absent extends Schema.TaggedClass<Absent>()("Absent", {}) {}
export class Binary extends Schema.TaggedClass<Binary>()("Binary", {}) {}
export class Text extends Schema.TaggedClass<Text>()("Text", {
  content: Schema.String,
}) {}

export const FileContent = Schema.Union([Absent, Binary, Text]);
export type FileContent = typeof FileContent.Type;

// ── DiffValue ───────────────────────────────────────────────────────

export class DiffValue extends Schema.Class<DiffValue>("@ami/DiffValue")({
  before: FileContent,
  after: FileContent,
}) {}

// ── Diff ────────────────────────────────────────────────────────────

export class Diff extends Schema.Class<Diff>("@ami/Diff")({
  change: ChangeType,
  diff: DiffValue,
  comments: Schema.Array(TextComment),
  /** Option.some(hash) for committed diffs; Option.none() for working-tree / index diffs */
  commitHash: Schema.Option(CommitHash),
}) {
  get hasComments(): boolean {
    return this.comments.length > 0;
  }

  /** Immutable — returns a new Diff with matching comments attached by commitHash + relativePath */
  attachComments(comment: Comment) {
    if (Option.isNone(this.commitHash)) return this;
    if (comment.commitHash !== this.commitHash.value) return this;
    const matching = comment.value.filter((tc) => tc.relativePath === this.change.relativePath);
    if (matching.length === 0) return this;
    return new Diff({ ...this, comments: matching });
  }

  /** Filename from `change.relativePath` */
  get baseName() {
    return this.change.relativePath.split("/").pop() ?? this.change.relativePath;
  }

  /** Directory from `change.relativePath` */
  get dirName() {
    const i = this.change.relativePath.lastIndexOf("/");
    return i === -1 ? "" : this.change.relativePath.slice(0, i);
  }

  /** Handles renames: shows `old → new` when the filename changed */
  get displayName(): string {
    const name = this.baseName;
    const prev = this.change.previousPath;
    if (!prev) return name;
    const prevName = prev.split("/").pop() ?? prev;
    if (prevName !== name) return `${prevName} → ${name}`;
    return `${prev} → ${this.change.relativePath}`;
  }

  /** Full path with rename notation */
  get displayPath(): string {
    const path = this.change.relativePath;
    const prev = this.change.previousPath;
    if (!prev) return path;
    return `${prev} → ${path}`;
  }

  /** Whether either side of the diff is binary */
  get isBinary() {
    return this.diff.before._tag === "Binary" || this.diff.after._tag === "Binary";
  }

  /** Text content of the "before" side, or empty string for Absent/Binary */
  get beforeText(): string {
    return this.diff.before._tag === "Text" ? this.diff.before.content : "";
  }

  /** Text content of the "after" side, or empty string for Absent/Binary */
  get afterText(): string {
    return this.diff.after._tag === "Text" ? this.diff.after.content : "";
  }

  // HACK: stubbed until @pierre/diffs is added as a dependency
  get stats() {
    return { additions: 0, deletions: 0 };
  }

  /** Turns the comments into a prompt sent to the agent */
  get prompt() {
    if (this.comments.length === 0) return "";

    const after = this.diff.after;
    const afterContent = after._tag === "Text" ? after.content : undefined;
    const lines = afterContent?.split("\n");

    return this.comments
      .map((tc) => {
        let codeSnippet = "";
        if (lines) {
          const start = Math.max(0, tc.range.startLine - 1);
          const end = Math.min(lines.length, tc.range.endLine);
          const snippetLines = lines.slice(start, end);
          codeSnippet = snippetLines.map((line, i) => `    ${start + i + 1}| ${line}`).join("\n");
        }

        return [
          `<review_comment file="${this.change.relativePath}">`,
          `  <code>`,
          codeSnippet,
          `  </code>`,
          `  <comment>${tc.text}</comment>`,
          `</review_comment>`,
        ].join("\n");
      })
      .filter(Boolean)
      .join("\n");
  }
}
