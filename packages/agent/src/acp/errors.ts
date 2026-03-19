import { Schema } from "effect";

export class AcpTransportError extends Schema.ErrorClass<AcpTransportError>("AcpTransportError")({
  _tag: Schema.tag("AcpTransportError"),
  cause: Schema.String,
}) {
  message = `ACP transport error: ${this.cause}`;
}

export class AcpInitializeError extends Schema.ErrorClass<AcpInitializeError>("AcpInitializeError")(
  {
    _tag: Schema.tag("AcpInitializeError"),
    cause: Schema.String,
  },
) {
  message = `ACP initialization failed: ${this.cause}`;
}

export class AcpSessionError extends Schema.ErrorClass<AcpSessionError>("AcpSessionError")({
  _tag: Schema.tag("AcpSessionError"),
  cause: Schema.String,
}) {
  message = `ACP session error: ${this.cause}`;
}

export class AcpPromptError extends Schema.ErrorClass<AcpPromptError>("AcpPromptError")({
  _tag: Schema.tag("AcpPromptError"),
  cause: Schema.String,
}) {
  message = `ACP prompt error: ${this.cause}`;
}
