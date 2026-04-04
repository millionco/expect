import { Effect, Exit } from "effect";
import { useQuery } from "@tanstack/react-query";
import {
  UPDATE_CHECK_STALE_MS,
  UPDATE_CHECK_TIMEOUT_MS,
  VERSION,
  VERSION_API_URL,
} from "../constants";
import { isNewerVersion } from "../utils/is-newer-version";

const fetchLatestVersion = Effect.tryPromise({
  try: () =>
    fetch(`${VERSION_API_URL}?source=update-check&t=${Date.now()}`, {
      cache: "no-store",
    }).then((response) => response.text()),
  catch: (cause) => new Error(`Version API fetch failed: ${cause}`),
}).pipe(
  Effect.map((version) => version.trim()),
  Effect.timeoutOrElse({
    duration: UPDATE_CHECK_TIMEOUT_MS,
    onTimeout: () => Effect.succeed(undefined),
  }),
);

interface UpdateCheckResult {
  latestVersion: string | undefined;
  updateAvailable: boolean;
}

export const useUpdateCheck = (): UpdateCheckResult => {
  const { data: latestVersion } = useQuery({
    queryKey: ["update-check"],
    queryFn: async (): Promise<string | undefined> => {
      const exit = await Effect.runPromiseExit(fetchLatestVersion);
      if (Exit.isSuccess(exit)) return exit.value;
      return undefined;
    },
    staleTime: UPDATE_CHECK_STALE_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const updateAvailable = latestVersion !== undefined && isNewerVersion(latestVersion, VERSION);

  return { latestVersion, updateAvailable };
};
