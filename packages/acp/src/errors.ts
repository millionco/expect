import { Schema } from "effect";

export class AcpClientError extends Schema.ErrorClass<AcpClientError>("AcpClientError")({
  _tag: Schema.tag("AcpClientError"),
  cause: Schema.String,
}) {
  message = `ACP client error: ${this.cause}`;
}

export class JsonRpcParseError extends Schema.ErrorClass<JsonRpcParseError>("AcpJsonRpcParseError")(
  {
    _tag: Schema.tag("AcpJsonRpcParseError"),
    cause: Schema.String,
  },
) {
  message = `JSON-RPC parse error: ${this.cause}`;
}

export class SessionNotFoundError extends Schema.ErrorClass<SessionNotFoundError>(
  "AcpSessionNotFoundError",
)({
  _tag: Schema.tag("AcpSessionNotFoundError"),
  sessionId: Schema.String,
}) {
  message = `Session not found: ${this.sessionId}`;
}

export class TransportClosedError extends Schema.ErrorClass<TransportClosedError>(
  "AcpTransportClosedError",
)({
  _tag: Schema.tag("AcpTransportClosedError"),
}) {
  message = "Transport connection closed";
}
