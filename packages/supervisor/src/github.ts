import { Array as Arr, Effect, Layer, Match, Option, Schema, ServiceMap } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { join } from "node:path";
import { COMMENT_DIRECTORY_PREFIX, GITHUB_TIMEOUT_MS, PR_LIMIT } from "./constants";
import { FileSystem } from "effect/FileSystem";
import {
  FindPullRequestPayload,
  GhPrListItem,
  PullRequest,
  RemoteBranch,
} from "@expect/shared/models";

export class GitHubCommandError extends Schema.ErrorClass<GitHubCommandError>("GitHubCommandError")(
  {
    _tag: Schema.tag("GitHubCommandError"),
    cause: Schema.String,
  },
) {
  message = `GitHub CLI command failed: ${this.cause}`;
}

export class Github extends ServiceMap.Service<Github>()("@supervisor/GitHub", {
  make: Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const fileSystem = yield* FileSystem;

    const runGhCommand = Effect.fn("GitHub.runGhCommand")(function* (cwd: string, args: string[]) {
      return yield* spawner.string(ChildProcess.make("gh", args, { cwd })).pipe(
        Effect.timeout(GITHUB_TIMEOUT_MS),
        Effect.catchTags({
          PlatformError: (e) => Effect.fail(new GitHubCommandError({ cause: e.message })),
          TimeoutError: () => Effect.fail(new GitHubCommandError({ cause: "command timed out" })),
        }),
        Effect.map((stdout) => stdout.trim()),
      );
    });

    const findPullRequest = Effect.fn("GitHub.findPullRequest")(function* (
      cwd: string,
      payload: FindPullRequestPayload,
    ) {
      const branchName = Match.value(payload).pipe(
        Match.when({ _tag: "Branch" }, (p) => p.branchName),
        Match.exhaustive,
      );
      const output = yield* runGhCommand(cwd, [
        "pr",
        "list",
        "--head",
        branchName,
        "--state",
        "open",
        "--limit",
        "1",
        "--json",
        "number,url,title,headRefName",
      ]);
      return yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Array(PullRequest)))(
        output,
      ).pipe(
        Effect.map(Arr.head),
        Effect.catchTag("SchemaError", () => Effect.succeed(Option.none<PullRequest>())),
      );
    });

    const GhPrList = Schema.fromJsonString(Schema.Array(GhPrListItem));

    const listPullRequests = Effect.fn("GitHub.listPullRequests")(function* (cwd: string) {
      const output = yield* runGhCommand(cwd, [
        "pr",
        "list",
        "--state",
        "all",
        "--json",
        "number,headRefName,author,state,updatedAt",
        "--limit",
        String(PR_LIMIT),
      ]).pipe(Effect.catchTag("GitHubCommandError", () => Effect.succeed("[]")));

      const items = yield* Schema.decodeEffect(GhPrList)(output).pipe(
        Effect.catchTag("SchemaError", Effect.die),
      );

      return items.map(
        (item) =>
          new RemoteBranch({
            name: item.headRefName,
            author: item.author.login,
            prNumber: item.number,
            prStatus:
              item.state === "OPEN"
                ? "open"
                : item.state === "MERGED"
                  ? "merged"
                  : item.state === "CLOSED"
                    ? "merged"
                    : null,
            updatedAt: item.updatedAt,
          }),
      );
    });

    const addComment = Effect.fn("GitHub.addComment")(function* (
      cwd: string,
      pullRequest: PullRequest,
      body: string,
    ) {
      yield* Effect.scoped(
        Effect.gen(function* () {
          const dir = yield* fileSystem.makeTempDirectoryScoped({
            prefix: COMMENT_DIRECTORY_PREFIX,
          });
          const bodyPath = join(dir, "pull-request-comment.md");
          yield* fileSystem.writeFileString(bodyPath, body);
          yield* runGhCommand(cwd, [
            "pr",
            "comment",
            String(pullRequest.number),
            "--body-file",
            bodyPath,
          ]);
        }),
      );
    });

    const findComment = Effect.fn("GitHub.findComment")(function* (
      cwd: string,
      prNumber: number,
      marker: string,
    ) {
      yield* Effect.annotateCurrentSpan({ prNumber, marker });
      const output = yield* runGhCommand(cwd, [
        "api",
        `repos/{owner}/{repo}/issues/${prNumber}/comments`,
        "--jq",
        `.[] | select(.body | contains("${marker}")) | .id`,
      ]);
      const commentId = output.trim();
      return commentId.length > 0 ? Option.some(Number(commentId)) : Option.none();
    });

    const updateComment = Effect.fn("GitHub.updateComment")(function* (
      cwd: string,
      commentId: number,
      body: string,
    ) {
      yield* Effect.annotateCurrentSpan({ commentId });
      yield* Effect.scoped(
        Effect.gen(function* () {
          const dir = yield* fileSystem.makeTempDirectoryScoped({
            prefix: COMMENT_DIRECTORY_PREFIX,
          });
          const bodyPath = join(dir, "pull-request-comment.md");
          yield* fileSystem.writeFileString(bodyPath, body);
          yield* runGhCommand(cwd, [
            "api",
            `repos/{owner}/{repo}/issues/comments/${commentId}`,
            "-X",
            "PATCH",
            "--input",
            bodyPath,
          ]);
        }),
      );
    });

    const uploadVideo = Effect.fn("GitHub.uploadVideo")(function* (
      cwd: string,
      prNumber: number,
      filePath: string,
    ) {
      yield* Effect.annotateCurrentSpan({ prNumber, filePath });
      const output = yield* runGhCommand(cwd, [
        "api",
        `repos/{owner}/{repo}/issues/${prNumber}/comments`,
        "-f",
        `body=<video src="file://${filePath}" controls></video>`,
      ]);
      return output;
    });

    const upsertComment = Effect.fn("GitHub.upsertComment")(function* (
      cwd: string,
      pullRequest: PullRequest,
      marker: string,
      body: string,
    ) {
      yield* Effect.annotateCurrentSpan({ prNumber: pullRequest.number, marker });
      const existingId = yield* findComment(cwd, pullRequest.number, marker);
      yield* Option.match(existingId, {
        onNone: () => addComment(cwd, pullRequest, body),
        onSome: (commentId) => updateComment(cwd, commentId, body),
      });
      yield* Effect.logInfo("PR comment upserted", { prNumber: pullRequest.number });
    });

    return {
      findPullRequest,
      listPullRequests,
      addComment,
      findComment,
      updateComment,
      uploadVideo,
      upsertComment,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
