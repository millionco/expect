import { Codex } from "@openai/codex-sdk";
import type { UserInput } from "@openai/codex-sdk";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import { CodexRunError } from "./errors.js";
import { CodexThreadEvent } from "./schemas/codex-stream.js";
import { AgentStreamOptions } from "./types.js";

const prepareCodexThread = (options: AgentStreamOptions) => {
  const codex = new Codex();
  const threadOptions = {
    workingDirectory: options.cwd,
    model: options.model,
    skipGitRepoCheck: true,
  };
  return Option.isSome(options.sessionId)
    ? codex.resumeThread(options.sessionId.value, threadOptions)
    : codex.startThread(threadOptions);
};

const buildInput = (options: AgentStreamOptions): UserInput[] =>
  Option.isSome(options.systemPrompt)
    ? [
        { type: "text", text: options.systemPrompt.value },
        { type: "text", text: options.prompt },
      ]
    : [{ type: "text", text: options.prompt }];

export class CodexProvider extends ServiceMap.Service<
  CodexProvider,
  {
    readonly stream: (
      options: AgentStreamOptions,
    ) => Stream.Stream<LanguageModelV3StreamPart, CodexRunError>;
  }
>()("@browser-tester/CodexProvider") {
  static layer = Layer.succeed(
    CodexProvider,
    CodexProvider.of({
      stream: (options) => {
        const thread = prepareCodexThread(options);
        const input = buildInput(options);

        return Stream.unwrap(
          Effect.tryPromise({
            try: async (signal) => {
              const { events } = await thread.runStreamed(input, { signal });
              return Stream.fromAsyncIterable(
                events,
                (cause) => new CodexRunError({ cause: String(cause) }),
              );
            },
            catch: (cause) => new CodexRunError({ cause: String(cause) }),
          }),
        ).pipe(
          Stream.mapEffect((rawEvent) => Schema.decodeUnknownEffect(CodexThreadEvent)(rawEvent)),
          Stream.map((event) => event.streamParts),
          Stream.filter(Option.isSome),
          Stream.flatMap((option) => Stream.fromIterable(option.value)),
        );
      },
    }),
  );
}
