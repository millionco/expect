import { execFile } from "node:child_process";
import * as os from "node:os";
import { promisify } from "node:util";
import { Effect } from "effect";
import { ListBrowsersError } from "./errors";

const execFileAsync = promisify(execFile);

const SAFARI_BUNDLE_ID = "com.apple.safari";

const WINDOWS_PROG_ID_TO_BUNDLE_ID: Record<string, string> = {
  MSEdgeHTM: "com.microsoft.edge",
  MSEdgeBHTML: "com.microsoft.edge",
  MSEdgeDHTML: "com.microsoft.edge",
  AppXq0fevzme2pys62n3e0fbqa7peapykr8v: "com.microsoft.edge",
  ChromeHTML: "com.google.chrome",
  ChromeBHTML: "com.google.chrome",
  ChromeDHTML: "com.google.chrome",
  ChromiumHTM: "org.chromium.chromium",
  BraveHTML: "com.brave.browser",
  BraveBHTML: "com.brave.browser",
  BraveDHTML: "com.brave.browser",
  BraveSSHTM: "com.brave.browser",
  FirefoxURL: "org.mozilla.firefox",
  OperaStable: "com.operasoftware.opera",
  VivaldiHTM: "com.vivaldi.vivaldi",
};

const detectDarwin = Effect.fn("detectDefaultBrowserDarwin")(function* () {
  const result = yield* Effect.tryPromise({
    try: () =>
      execFileAsync("defaults", [
        "read",
        "com.apple.LaunchServices/com.apple.launchservices.secure",
        "LSHandlers",
      ]),
    catch: (cause) => new ListBrowsersError({ cause: String(cause) }),
  }).pipe(Effect.catchTag("ListBrowsersError", () => Effect.succeed(undefined)));

  if (!result) return SAFARI_BUNDLE_ID;

  const match =
    /LSHandlerRoleAll = "(?!-)(?<id>[^"]+?)";\s+?LSHandlerURLScheme = (?:http|https);/.exec(
      result.stdout,
    );

  return match?.groups?.id ?? SAFARI_BUNDLE_ID;
});

const detectLinux = Effect.fn("detectDefaultBrowserLinux")(function* () {
  const { stdout } = yield* Effect.tryPromise({
    try: () => execFileAsync("xdg-mime", ["query", "default", "x-scheme-handler/http"]),
    catch: (cause) => new ListBrowsersError({ cause: String(cause) }),
  });

  return stdout.trim();
});

const detectWindows = Effect.fn("detectDefaultBrowserWindows")(function* () {
  const { stdout } = yield* Effect.tryPromise({
    try: () =>
      execFileAsync("reg", [
        "QUERY",
        "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice",
        "/v",
        "ProgId",
      ]),
    catch: (cause) => new ListBrowsersError({ cause: String(cause) }),
  });

  const match = /ProgId\s*REG_SZ\s*(?<id>\S+)/.exec(stdout);
  if (!match?.groups?.id) {
    return yield* new ListBrowsersError({
      cause: `Cannot find default browser ProgId in registry output`,
    });
  }

  const progId = match.groups.id;
  const dotIndex = progId.lastIndexOf(".");
  const hyphenIndex = progId.lastIndexOf("-");
  const baseByDot = dotIndex === -1 ? undefined : progId.slice(0, dotIndex);
  const baseByHyphen = hyphenIndex === -1 ? undefined : progId.slice(0, hyphenIndex);

  return (
    WINDOWS_PROG_ID_TO_BUNDLE_ID[progId] ??
    (baseByDot ? WINDOWS_PROG_ID_TO_BUNDLE_ID[baseByDot] : undefined) ??
    (baseByHyphen ? WINDOWS_PROG_ID_TO_BUNDLE_ID[baseByHyphen] : undefined) ??
    progId
  );
});

export const detectDefaultBrowserId = Effect.fn("detectDefaultBrowserId")(function* () {
  const platform = os.platform();

  if (platform === "darwin") return yield* detectDarwin();
  if (platform === "linux") return yield* detectLinux();
  if (platform === "win32") return yield* detectWindows();

  return yield* new ListBrowsersError({ cause: `Unsupported platform: ${platform}` });
});
