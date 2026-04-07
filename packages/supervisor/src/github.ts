import { Array as Arr, Effect, Layer, Match, Option, Schema, ServiceMap } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as path from "node:path";
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
          const bodyPath = path.join(dir, "pull-request-comment.md");
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
      const escapedMarker = marker.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const output = yield* runGhCommand(cwd, [
        "api",
        `repos/{owner}/{repo}/issues/${prNumber}/comments`,
        "--paginate",
        "--jq",
        `.[] | select(.body | contains("${escapedMarker}")) | .id`,
      ]);
      const firstLine = output.trim().split("\n")[0] ?? "";
      const parsed = Number(firstLine);
      return firstLine.length > 0 && !Number.isNaN(parsed) ? Option.some(parsed) : Option.none();
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
          const bodyPath = path.join(dir, "pull-request-comment.json");
          yield* fileSystem.writeFileString(bodyPath, JSON.stringify({ body }));
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

    const createPullRequest = Effect.fn("GitHub.createPullRequest")(function* (
      cwd: string,
      options: {
        readonly title: string;
        readonly body: string;
        readonly base?: string;
        readonly draft?: boolean;
      },
    ) {
      yield* Effect.annotateCurrentSpan({ title: options.title, draft: options.draft });
      const args = ["pr", "create", "--title", options.title, "--body", options.body];
      if (options.base) {
        args.push("--base", options.base);
      }
      if (options.draft) {
        args.push("--draft");
      }
      const output = yield* runGhCommand(cwd, args);
      yield* Effect.logInfo("Pull request created", { url: output });
      return output;
    });

    return {
      findPullRequest,
      listPullRequests,
      addComment,
      findComment,
      updateComment,
      upsertComment,
      createPullRequest,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
