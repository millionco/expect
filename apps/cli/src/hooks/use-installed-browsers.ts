import { useQuery } from "@tanstack/react-query";
import { Effect, Option } from "effect";
import { Browsers, layerLive, type Browser } from "@expect/cookies";
import * as NodeServices from "@effect/platform-node/NodeServices";

export const useInstalledBrowsers = () =>
  useQuery({
    queryKey: ["installed-browsers"],
    queryFn: (): Promise<{ default: Option.Option<Browser>; browsers: Browser[] }> =>
      Effect.gen(function* () {
        const browsersService = yield* Browsers;
        const browsers = yield* browsersService.list;
        const defaultBrowser = yield* browsersService.defaultBrowser();
        return { default: defaultBrowser, browsers };
      }).pipe(Effect.provide(layerLive), Effect.provide(NodeServices.layer), Effect.runPromise),
  });
