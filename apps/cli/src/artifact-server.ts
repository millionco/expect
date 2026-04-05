import { createServer, request as httpRequest } from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { Hono } from "hono";
import { proxy } from "hono/proxy";
import { serve } from "@hono/node-server";
import { HttpRouter } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { ArtifactRpcs } from "@expect/shared/rpcs";
import { LIVE_VIEWER_RPC_PORT, LIVE_VIEWER_STATIC_PORT } from "@expect/shared";
import { CurrentPlanId } from "@expect/shared/models";
import { ArtifactRpcsLive } from "@expect/supervisor";
import { ReplayHost } from "./replay-host";

const RpcLive = RpcServer.layerHttp({
  group: ArtifactRpcs,
  path: "/rpc",
}).pipe(Layer.provide(ArtifactRpcsLive));

export const layerArtifactRpcServer = RpcLive.pipe(
  Layer.provideMerge(HttpRouter.serve(RpcLive, { disableListenLog: true, disableLogger: true })),
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port: LIVE_VIEWER_RPC_PORT })),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeServices.layer),
  Layer.provide(HttpRouter.layer),
);

const proxyWebSocketUpgrade = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  upstreamOrigin: string,
) => {
  const upstreamUrl = new URL(request.url ?? "/", upstreamOrigin);

  const upstreamReq = httpRequest({
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    path: upstreamUrl.pathname + upstreamUrl.search,
    method: "GET",
    headers: { ...request.headers, host: upstreamUrl.host },
  });

  upstreamReq.on("upgrade", (_res, upstreamSocket, upstreamHead) => {
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${_res.headers["sec-websocket-accept"]}`,
        "",
        "",
      ].join("\r\n"),
    );

    if (upstreamHead.length > 0) socket.write(upstreamHead);
    if (head.length > 0) upstreamSocket.write(head);

    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);

    socket.on("error", () => upstreamSocket.destroy());
    upstreamSocket.on("error", () => socket.destroy());
  });

  upstreamReq.on("error", () => socket.destroy());
  upstreamReq.end();
};

export const layerArtifactViewerProxy = Layer.effectDiscard(
  Effect.gen(function* () {
    const replayHost = yield* ReplayHost;
    const planId = yield* CurrentPlanId;

    const normalizedReplayHost = /^https?:\/\//.test(replayHost)
      ? replayHost
      : `http://${replayHost}`;
    const replayHostParsed = new URL(normalizedReplayHost);

    const app = new Hono();

    app.all("/*", async (context) => {
      const upstreamUrl = new URL(context.req.path, normalizedReplayHost);
      upstreamUrl.search = new URL(context.req.url).search;

      try {
        return await proxy(upstreamUrl.toString(), {
          headers: {
            "User-Agent": context.req.header("user-agent") ?? "",
            Accept: context.req.header("accept") ?? "*/*",
            Host: replayHostParsed.host,
          },
        });
      } catch {
        return context.text(`Bad Gateway: could not reach ${replayHostParsed.host}`, 502);
      }
    });

    app.onError((_error, context) => context.text("Internal Server Error", 500));

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const server = serve({
          fetch: app.fetch,
          port: LIVE_VIEWER_STATIC_PORT,
        });
        server.on("upgrade", (request, socket, head) => {
          proxyWebSocketUpgrade(request, socket, head, normalizedReplayHost);
        });
        return server;
      }),
      (server) =>
        Effect.callback<void>((resume) => {
          server.close(() => resume(Effect.void));
        }),
    );

    yield* Effect.logInfo("Replay proxy started", {
      proxyUrl: `http://localhost:${LIVE_VIEWER_STATIC_PORT}`,
      replayHost: normalizedReplayHost,
    });

    yield* Effect.logInfo(
      `Live viewer: http://localhost:${LIVE_VIEWER_STATIC_PORT}/replay/?testId=${planId}`,
    );
  }),
);
