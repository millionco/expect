import { Schema } from "effect";

export class ExpectTimeoutError extends Schema.ErrorClass<ExpectTimeoutError>("ExpectTimeoutError")(
  {
    _tag: Schema.tag("ExpectTimeoutError"),
    timeoutMs: Schema.Number,
  },
) {
  message = `expect execution timed out after ${this.timeoutMs}ms`;
}

export class ExpectConfigError extends Error {
  constructor(message: string, fix: string) {
    super(`${message}\n\nFix: ${fix}`);
    this.name = "ExpectConfigError";
  }
}
