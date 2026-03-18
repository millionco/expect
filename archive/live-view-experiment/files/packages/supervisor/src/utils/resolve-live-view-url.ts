import { createServer } from "node:net";
import {
  LIVE_VIEW_DEFAULT_PORT,
  LIVE_VIEW_HOST,
  LIVE_VIEW_PORT_SEARCH_LIMIT,
} from "../constants";

const isPortAvailable = async (port: number): Promise<boolean> => {
  const server = createServer();

  return new Promise<boolean>((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }

      reject(error);
    });

    server.listen(port, LIVE_VIEW_HOST, () => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(true);
      });
    });
  });
};

export const resolveLiveViewUrl = async (): Promise<string> => {
  for (
    let candidatePort = LIVE_VIEW_DEFAULT_PORT;
    candidatePort < LIVE_VIEW_DEFAULT_PORT + LIVE_VIEW_PORT_SEARCH_LIMIT;
    candidatePort += 1
  ) {
    if (await isPortAvailable(candidatePort)) {
      return `http://${LIVE_VIEW_HOST}:${candidatePort}/`;
    }
  }

  throw new Error("Unable to reserve a local live view port.");
};
