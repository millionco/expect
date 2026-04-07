import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import net from "node:net";
import { Effect, Option } from "effect";
import { CDP_DISCOVERY_TIMEOUT_MS, CDP_COMMON_PORTS, CDP_PORT_PROBE_TIMEOUT_MS } from "./constants";
import { CdpDiscoveryError } from "./errors";
import { parseDevToolsActivePort } from "./utils/parse-devtools-active-port";

interface VersionInfo {
  readonly webSocketDebuggerUrl?: string;
}

const fetchJson = <A>(url: string) =>
  Effect.tryPromise({
    try: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CDP_DISCOVERY_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal });
        return (await response.json()) as A;
      } finally {
        clearTimeout(timer);
      }
    },
    catch: (cause) => new CdpDiscoveryError({ cause: `Failed to fetch ${url}: ${cause}` }),
  });

const rewriteWsHost = (wsUrl: string, host: string, port: number) => {
  try {
    const parsed = new URL(wsUrl);
    parsed.hostname = host;
    parsed.port = String(port);
    return parsed.toString();
  } catch {
    return wsUrl;
  }
};

const discoverViaJsonVersion = (host: string, port: number) =>
  fetchJson<VersionInfo>(`http://${host}:${port}/json/version`).pipe(
    Effect.flatMap((info) => {
      if (!info.webSocketDebuggerUrl) {
        return new CdpDiscoveryError({
          cause: `No webSocketDebuggerUrl in /json/version at ${host}:${port}`,
        }).asEffect();
      }
      return Effect.succeed(rewriteWsHost(info.webSocketDebuggerUrl, host, port));
    }),
  );

interface CdpTarget {
  readonly type?: string;
  readonly webSocketDebuggerUrl?: string;
}

const discoverViaJsonList = (host: string, port: number) =>
  fetchJson<CdpTarget[]>(`http://${host}:${port}/json/list`).pipe(
    Effect.flatMap((targets) => {
      const browserTarget = targets.find((target) => target.type === "browser");
      const target = browserTarget ?? targets[0];
      const wsUrl = target?.webSocketDebuggerUrl;
      if (!wsUrl) {
        return new CdpDiscoveryError({
          cause: `No webSocketDebuggerUrl found in /json/list at ${host}:${port}`,
        }).asEffect();
      }
      return Effect.succeed(rewriteWsHost(wsUrl, host, port));
    }),
  );

const isPortReachable = (host: string, port: number) =>
  Effect.promise(
    () =>
      new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(CDP_PORT_PROBE_TIMEOUT_MS);
        socket.once("connect", () => {
          socket.destroy();
          resolve(true);
        });
        socket.once("timeout", () => {
          socket.destroy();
          resolve(false);
        });
        socket.once("error", () => {
          socket.destroy();
          resolve(false);
        });
        socket.connect(port, host);
      }),
  );

const tryDiscover = <A>(effect: Effect.Effect<A, CdpDiscoveryError>) =>
  effect.pipe(
    Effect.map((value) => Option.some(value)),
    Effect.catchTag("CdpDiscoveryError", () => Effect.succeed(Option.none<A>())),
  );

export const discoverCdpUrl = Effect.fn("Chrome.discoverCdpUrl")(function* (
  host: string,
  port: number,
) {
  yield* Effect.annotateCurrentSpan({ host, port });

  const versionResult = yield* tryDiscover(discoverViaJsonVersion(host, port));
  if (Option.isSome(versionResult)) return versionResult.value;

  const listResult = yield* tryDiscover(discoverViaJsonList(host, port));
  if (Option.isSome(listResult)) return listResult.value;

  return yield* new CdpDiscoveryError({
    cause: `All CDP discovery methods failed for ${host}:${port}`,
  });
});

const getChromeUserDataDirs = () => {
  const home = os.homedir();
  const platform = os.platform();

  if (platform === "darwin") {
    const base = path.join(home, "Library", "Application Support");
    return [
      path.join(base, "Google", "Chrome"),
      path.join(base, "Google", "Chrome Canary"),
      path.join(base, "Chromium"),
      path.join(base, "BraveSoftware", "Brave-Browser"),
      path.join(base, "Microsoft Edge"),
      path.join(base, "Arc", "User Data"),
      path.join(base, "net.imput.helium"),
    ];
  }

  if (platform === "linux") {
    const config = path.join(home, ".config");
    return [
      path.join(config, "google-chrome"),
      path.join(config, "google-chrome-unstable"),
      path.join(config, "chromium"),
      path.join(config, "BraveSoftware", "Brave-Browser"),
      path.join(config, "microsoft-edge"),
    ];
  }

  if (platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"];
    if (!localAppData) return [];
    return [
      path.join(localAppData, "Google", "Chrome", "User Data"),
      path.join(localAppData, "Google", "Chrome SxS", "User Data"),
      path.join(localAppData, "Chromium", "User Data"),
      path.join(localAppData, "BraveSoftware", "Brave-Browser", "User Data"),
      path.join(localAppData, "Microsoft", "Edge", "User Data"),
    ];
  }

  return [];
};

const readDevToolsActivePort = (userDataDir: string) =>
  Effect.tryPromise({
    try: () => fs.readFile(path.join(userDataDir, "DevToolsActivePort"), "utf-8"),
    catch: () =>
      new CdpDiscoveryError({
        cause: `No DevToolsActivePort file in ${userDataDir}`,
      }),
  }).pipe(
    Effect.flatMap((content) => {
      const parsed = parseDevToolsActivePort(content);
      if (!parsed) {
        return new CdpDiscoveryError({
          cause: `Invalid DevToolsActivePort in ${userDataDir}`,
        }).asEffect();
      }
      return Effect.succeed(parsed);
    }),
  );

const removeStaleFile = (filePath: string) =>
  Effect.tryPromise({
    try: () => fs.unlink(filePath),
    catch: () => undefined,
  });

export const autoDiscoverCdp = Effect.fn("Chrome.autoDiscoverCdp")(function* () {
  const userDataDirs = getChromeUserDataDirs();

  for (const dir of userDataDirs) {
    const portResult = yield* tryDiscover(readDevToolsActivePort(dir));
    if (Option.isNone(portResult)) continue;

    const { port, wsPath } = portResult.value;
    yield* Effect.logDebug("Found DevToolsActivePort", { dir, port });
    const reachable = yield* isPortReachable("127.0.0.1", port);
    if (!reachable) {
      yield* Effect.logInfo("Removing stale DevToolsActivePort", { dir, port });
      yield* removeStaleFile(path.join(dir, "DevToolsActivePort"));
      continue;
    }

    const discovered = yield* tryDiscover(discoverCdpUrl("127.0.0.1", port));
    if (Option.isSome(discovered)) return discovered.value;

    return `ws://127.0.0.1:${port}${wsPath}`;
  }

  for (const port of CDP_COMMON_PORTS) {
    const reachable = yield* isPortReachable("127.0.0.1", port);
    if (!reachable) continue;

    yield* Effect.logDebug("Probing common CDP port", { port });
    const discovered = yield* tryDiscover(discoverCdpUrl("127.0.0.1", port));
    if (Option.isSome(discovered)) return discovered.value;
  }

  return yield* new CdpDiscoveryError({
    cause:
      "No running Chrome instance found. Launch Chrome with --remote-debugging-port or pass a CDP URL directly.",
  });
});
