import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { Layer } from "effect";
import * as Otlp from "effect/unstable/observability/Otlp";

const AXIOM_DATASET = "expect-cli";
const AXIOM_TOKEN = "xaat-a6ce2fdb-d378-444e-9d72-bb458867187a";
const AXIOM_DEFAULT_SERVICE_NAME = "expect-cli";

export const layerAxiom = (
  serviceName = AXIOM_DEFAULT_SERVICE_NAME /* service name is different from dataset name */,
) =>
  Otlp.layerJson({
    baseUrl: "https://api.axiom.co",
    resource: { serviceName },
    headers: {
      Authorization: `Bearer ${AXIOM_TOKEN}`,
      "X-Axiom-Dataset": AXIOM_DATASET,
    },
  }).pipe(Layer.provide(NodeHttpClient.layerUndici));
