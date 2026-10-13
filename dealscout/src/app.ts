import { createServer } from "node:http";
import type { Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { handleApi } from "./api.ts";
import { handleLegacy } from "./legacy.ts";

const webDist = join(import.meta.dirname, "..", "web", "dist");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".map": "application/json",
};

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => resolve(s));
  });
}

/** Serve web/dist (the React build) with SPA fallback. Returns false if there is no build. */
function serveStatic(url: string, res: import("node:http").ServerResponse): boolean {
  if (!existsSync(join(webDist, "index.html"))) return false;
  const rel = normalize(decodeURIComponent(url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(webDist, rel);
  if (!file.startsWith(webDist) || !existsSync(file) || statSync(file).isDirectory()) file = join(webDist, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
  return true;
}

export function createApp(): Server {
  return createServer(async (req, res) => {
    const url = req.url ?? "/";
    try {
      const raw = req.method === "GET" || req.method === "DELETE" ? "" : await readBody(req);
      let body: any = {};
      let bad = false;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          bad = true;
        }
      }
      if (await handleApi(req, res, body, bad)) return;
      if (await handleLegacy(req, res, body)) return;
      if (req.method === "GET" && !url.startsWith("/api/") && serveStatic(url, res)) return;
      if (req.method === "GET" && url === "/") {
        // No React build yet: fall back to the original UI.
        res.writeHead(302, { location: "/legacy" });
        return void res.end();
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "INTERNAL", message: (err as Error).message } }));
    }
  });
}
