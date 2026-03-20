import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ndjson": "application/x-ndjson",
};

interface ServedDirectory {
  url: string;
  close: () => void;
}

export const serveDirectory = (directoryPath: string, port: number): Promise<ServedDirectory> =>
  new Promise((resolve, reject) => {
    const handler = async (request: IncomingMessage, response: ServerResponse) => {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const filePath = join(directoryPath, pathname === "/" ? "index.html" : pathname);

      try {
        const content = await readFile(filePath);
        const mimeType = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
        response.writeHead(200, { "Content-Type": mimeType });
        response.end(content);
      } catch {
        response.writeHead(404);
        response.end("Not found");
      }
    };

    const server = createServer(handler);
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const assignedPort = (server.address() as import("node:net").AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${assignedPort}/`,
        close: () => server.close(),
      });
    });
  });
