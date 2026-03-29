import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || (process.env.RAILWAY_ENVIRONMENT ? "0.0.0.0" : "127.0.0.1");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function safeJoin(baseDir, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  return path.join(baseDir, normalized);
}

async function serveFile(filePath, res) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] || "application/octet-stream";
  const fileStats = await stat(filePath);

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": fileStats.size,
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300",
  });

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("close", resolve);
    stream.pipe(res);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/") {
      pathname = "/index.html";
    }

    const candidatePath = safeJoin(publicDir, pathname);
    const resolvedPublic = path.resolve(publicDir);
    const resolvedCandidate = path.resolve(candidatePath);
    if (!resolvedCandidate.startsWith(resolvedPublic)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    try {
      await serveFile(resolvedCandidate, res);
    } catch {
      const fallback = path.join(publicDir, "index.html");
      if (pathname.endsWith(".html") || !path.extname(pathname)) {
        await serveFile(fallback, res);
      } else {
        sendJson(res, 404, { error: "Not found" });
      }
    }
  } catch (error) {
    sendJson(res, 500, { error: "Server error", detail: String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Tambola caller running on http://${host}:${port}`);
});
