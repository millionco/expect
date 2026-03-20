import { Layer, ServiceMap } from "effect";

export class CurrentModel extends ServiceMap.Service<CurrentModel, string>()(
  "@browser-tester/CurrentModel",
) {
  static layerClaude = Layer.succeed(this, "claude-sonnet-4-20250514");
  static layerCodex = Layer.succeed(this, "gpt-5.4");
}
