import { platform } from "node:os";
import { Effect, Layer } from "effect";
import { NodeServices } from "@effect/platform-node";
import { Browsers } from "./browser-detector";
import { ChromiumSource, ChromiumPlatform } from "./chromium";
import { FirefoxSource, FirefoxPlatform } from "./firefox";
import { SafariSource, SafariPlatform } from "./safari";

const base = Browsers.layer;

const layerLiveDarwin = Layer.mergeAll(
  base,
  ChromiumSource.layer.pipe(
    Layer.provide(base),
    Layer.provide(ChromiumPlatform.layerDarwin),
    Layer.provide(NodeServices.layer),
  ),
  FirefoxSource.layer.pipe(
    Layer.provide(base),
    Layer.provide(FirefoxPlatform.layerDarwin),
    Layer.provide(NodeServices.layer),
  ),
  SafariSource.layer.pipe(
    Layer.provide(base),
    Layer.provide(SafariPlatform.layerDarwin),
    Layer.provide(NodeServices.layer),
  ),
);

const layerLiveLinux = Layer.mergeAll(
  base,
  ChromiumSource.layer.pipe(
    Layer.provide(base),
    Layer.provide(ChromiumPlatform.layerLinux),
    Layer.provide(NodeServices.layer),
  ),
  FirefoxSource.layer.pipe(
    Layer.provide(base),
    Layer.provide(FirefoxPlatform.layerLinux),
    Layer.provide(NodeServices.layer),
  ),
);

const layerLiveWin32 = Layer.mergeAll(
  base,
  ChromiumSource.layer.pipe(
    Layer.provide(base),
    Layer.provide(ChromiumPlatform.layerWin32),
    Layer.provide(NodeServices.layer),
  ),
  FirefoxSource.layer.pipe(
    Layer.provide(base),
    Layer.provide(FirefoxPlatform.layerWin32),
    Layer.provide(NodeServices.layer),
  ),
);

export const layerLive = Layer.unwrap(
  Effect.sync(() => {
    const currentPlatform = platform();
    if (currentPlatform === "darwin") return layerLiveDarwin;
    if (currentPlatform === "win32") return layerLiveWin32;
    return layerLiveLinux;
  }),
);
