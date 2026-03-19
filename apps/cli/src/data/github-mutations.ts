import { Effect } from "effect";
import { useMutation } from "@tanstack/react-query";
import { Github } from "@browser-tester/supervisor";
import type { PullRequest } from "@browser-tester/shared/models";

const postPrComment = (pullRequest: PullRequest, body: string) =>
  Effect.runPromise(
    Github.use((github) => github.addComment(process.cwd(), pullRequest, body)).pipe(
      Effect.provide(Github.layer),
    ),
  );

export const usePostPrComment = () =>
  useMutation({
    mutationFn: ({ pullRequest, body }: { pullRequest: PullRequest; body: string }) =>
      postPrComment(pullRequest, body),
  });
