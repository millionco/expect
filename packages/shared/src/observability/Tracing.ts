import * as NodeSocket from "@effect/platform-node/NodeSocket";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { Layer } from "effect";
import { DevTools } from "effect/unstable/devtools";
import * as Otlp from "effect/unstable/observability/Otlp";

export const layerDev = DevTools.layerWebSocket().pipe(
  Layer.provide(NodeSocket.layerWebSocketConstructor),
);

const AXIOM_DATASET = "expect-cli";
const AXIOM_TOKEN = "xaat-a6ce2fdb-d378-444e-9d72-bb458867187a";

export const layerAxiom = (serviceName = AXIOM_DATASET) =>
  Otlp.layerJson({
    baseUrl: "https://api.axiom.co",
    resource: { serviceName },
    headers: {
      Authorization: `Bearer ${AXIOM_TOKEN}`,
      "X-Axiom-Dataset": AXIOM_DATASET,
    },
  }).pipe(Layer.provide(NodeHttpClient.layerUndici));
