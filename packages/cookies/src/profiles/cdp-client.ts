import { formatError, sleep } from "@browser-tester/utils";
import WebSocket from "ws";
import type { CdpRawCookie, CdpResponse } from "../types.js";
import { CDP_RETRY_COUNT, CDP_RETRY_DELAY_MS } from "./constants.js";

interface CdpTarget {
  type: string;
  webSocketDebuggerUrl?: string;
}

const getPageWebSocketUrl = async (port: number): Promise<string> => {
  const listUrl = `http://localhost:${port}/json`;

  for (let attempt = 0; attempt < CDP_RETRY_COUNT; attempt++) {
    try {
      const response = await fetch(listUrl);
      const targets = (await response.json()) as CdpTarget[];
      const pageTarget = targets.find((target) => target.type === "page");
      if (!pageTarget) {
        throw new Error("no page target available yet");
      }
      if (!pageTarget.webSocketDebuggerUrl) {
        throw new Error("page target has no webSocketDebuggerUrl");
      }
      return pageTarget.webSocketDebuggerUrl;
    } catch (error) {
      if (attempt === CDP_RETRY_COUNT - 1) {
        throw new Error(
          `failed to get page target after ${CDP_RETRY_COUNT} attempts: ${formatError(error)}`,
        );
      }
      await sleep(CDP_RETRY_DELAY_MS);
    }
  }

  throw new Error("unreachable");
};

interface CdpCommand {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

const sendCdpCommand = (webSocketUrl: string, command: CdpCommand): Promise<CdpResponse> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);

    socket.on("open", () => {
      socket.send(JSON.stringify(command));
    });

    socket.on("message", (rawMessage: WebSocket.Data) => {
      try {
        const parsedResponse = JSON.parse(rawMessage.toString()) as CdpResponse;
        if (parsedResponse.id !== command.id) return;

        socket.close();
        resolve(parsedResponse);
      } catch (error) {
        socket.close();
        reject(new Error(`failed to parse CDP response: ${formatError(error)}`));
      }
    });

    socket.on("error", (error: Error) => {
      reject(new Error(`CDP WebSocket error: ${error.message}`));
    });
  });

export const getCookiesFromBrowser = async (port: number): Promise<CdpRawCookie[]> => {
  const webSocketUrl = await getPageWebSocketUrl(port);

  for (let attempt = 0; attempt < CDP_RETRY_COUNT; attempt++) {
    try {
      const response = await sendCdpCommand(webSocketUrl, {
        id: 1,
        method: "Network.getAllCookies",
      });

      if (response.error) {
        throw new Error(`CDP error: ${response.error.message} (code ${response.error.code})`);
      }

      return response.result?.cookies ?? [];
    } catch (error) {
      if (attempt === CDP_RETRY_COUNT - 1) {
        throw new Error(
          `failed to get cookies after ${CDP_RETRY_COUNT} attempts: ${formatError(error)}`,
        );
      }
      await sleep(CDP_RETRY_DELAY_MS);
    }
  }

  throw new Error("unreachable");
};
