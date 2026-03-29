import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const serverDataPath = path.join(dataDir, "tambola-server-data.json");
const runtimeStatePath = path.join(dataDir, "tambola-runtime-state.json");
const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || (process.env.RAILWAY_ENVIRONMENT ? "0.0.0.0" : "127.0.0.1");
const accessCode = (process.env.TAMBOLA_ACCESS_CODE || "awesome").trim().toLowerCase();

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

const serverData = JSON.parse(await readFile(serverDataPath, "utf8"));
const numberLookup = new Map(serverData.numberDirectory.map((entry) => [entry.number, entry]));
const sequencePool = serverData.sequencePool;
let sharedState;
sharedState = await loadRuntimeState();

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

function getDefaultState() {
  return {
    sequenceIndex: 0,
    currentIndex: -1,
    usedSequenceIndices: [0],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(candidate) {
  const defaults = getDefaultState();
  const sequenceIndex = Number.isInteger(candidate?.sequenceIndex)
    ? Math.min(Math.max(candidate.sequenceIndex, 0), sequencePool.length - 1)
    : defaults.sequenceIndex;
  const activeSequence = sequencePool[sequenceIndex].sequence;
  const currentIndex = Number.isInteger(candidate?.currentIndex)
    ? Math.min(Math.max(candidate.currentIndex, -1), activeSequence.length - 1)
    : defaults.currentIndex;
  const usedSequenceIndices = Array.isArray(candidate?.usedSequenceIndices)
    ? [...new Set(candidate.usedSequenceIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < sequencePool.length))]
    : [];

  if (!usedSequenceIndices.includes(sequenceIndex)) {
    usedSequenceIndices.push(sequenceIndex);
  }

  return {
    sequenceIndex,
    currentIndex,
    usedSequenceIndices: usedSequenceIndices.length ? usedSequenceIndices : [sequenceIndex],
    updatedAt: typeof candidate?.updatedAt === "string" ? candidate.updatedAt : defaults.updatedAt,
  };
}

async function loadRuntimeState() {
  await mkdir(dataDir, { recursive: true });

  try {
    const raw = await readFile(runtimeStatePath, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    const defaults = getDefaultState();
    await persistRuntimeState(defaults);
    return defaults;
  }
}

async function persistRuntimeState(nextState) {
  const normalized = normalizeState(nextState);
  sharedState = normalized;
  await writeFile(runtimeStatePath, JSON.stringify(normalized, null, 2), "utf8");
}

function getActiveSequence(state = sharedState) {
  return sequencePool[state.sequenceIndex].sequence;
}

function getCalledNumbers(state = sharedState) {
  return getActiveSequence(state).slice(0, state.currentIndex + 1);
}

function isAuthorized(code) {
  return typeof code === "string" && code.trim().toLowerCase() === accessCode;
}

function getAccessCode(req, body = null) {
  const headerCode = req.headers["x-tambola-access-code"];
  if (typeof headerCode === "string" && headerCode.trim()) {
    return headerCode;
  }
  return body?.accessCode;
}

function chooseNextSequenceIndex(state) {
  const unseenIndexes = sequencePool
    .map((_, index) => index)
    .filter((index) => !state.usedSequenceIndices.includes(index));

  if (unseenIndexes.length) {
    return {
      nextIndex: unseenIndexes[Math.floor(Math.random() * unseenIndexes.length)],
      restartedCycle: false,
    };
  }

  const freshCycleIndexes = sequencePool
    .map((_, index) => index)
    .filter((index) => index !== state.sequenceIndex);

  return {
    nextIndex: freshCycleIndexes[Math.floor(Math.random() * freshCycleIndexes.length)],
    restartedCycle: true,
  };
}

function buildPublicState(options = {}) {
  const activeSequence = getActiveSequence(sharedState);
  const calledNumbers = getCalledNumbers(sharedState);
  const currentNumber = sharedState.currentIndex >= 0 ? activeSequence[sharedState.currentIndex] : null;
  const currentEntry = currentNumber ? numberLookup.get(currentNumber) : null;
  const nextNumber = sharedState.currentIndex < activeSequence.length - 1 ? activeSequence[sharedState.currentIndex + 1] : null;

  return {
    currentIndex: sharedState.currentIndex,
    calledNumbers,
    calledCount: calledNumbers.length,
    remainingCount: activeSequence.length - calledNumbers.length,
    sequenceLength: activeSequence.length,
    currentEntry: currentEntry || null,
    updatedAt: sharedState.updatedAt,
    sequenceSource: serverData.sequenceDesignSource,
    nextNumber: options.includeHostDetails ? nextNumber : null,
  };
}

function buildSequencePayload() {
  return {
    sequence: getActiveSequence(sharedState),
    currentIndex: sharedState.currentIndex,
    updatedAt: sharedState.updatedAt,
  };
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const bodyText = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

async function handleTambolaAction(body) {
  const action = body?.action;
  const activeSequence = getActiveSequence(sharedState);
  const nextState = { ...sharedState };

  switch (action) {
    case "next":
      if (nextState.currentIndex < activeSequence.length - 1) {
        nextState.currentIndex += 1;
      }
      break;
    case "undo":
      if (nextState.currentIndex > -1) {
        nextState.currentIndex -= 1;
      }
      break;
    case "reset":
      nextState.currentIndex = -1;
      break;
    case "new-sequence": {
      if (sequencePool.length < 2) {
        break;
      }

      const { nextIndex, restartedCycle } = chooseNextSequenceIndex(nextState);
      nextState.sequenceIndex = nextIndex;
      nextState.currentIndex = -1;
      nextState.usedSequenceIndices = restartedCycle ? [nextIndex] : [...nextState.usedSequenceIndices, nextIndex];
      break;
    }
    default:
      throw new Error("Unsupported action.");
  }

  nextState.updatedAt = new Date().toISOString();
  await persistRuntimeState(nextState);
  return buildPublicState({ includeHostDetails: true });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/health") {
      sendJson(res, 200, { ok: true, updatedAt: sharedState.updatedAt });
      return;
    }

    if (pathname === "/api/tambola/state" && req.method === "GET") {
      const authorized = isAuthorized(getAccessCode(req));
      sendJson(res, 200, buildPublicState({ includeHostDetails: authorized }));
      return;
    }

    if (pathname === "/api/tambola/verify" && req.method === "POST") {
      const body = await parseJsonBody(req);
      if (!isAuthorized(getAccessCode(req, body))) {
        sendJson(res, 403, { ok: false, error: "Invalid access code." });
        return;
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/api/tambola/sequence" && req.method === "GET") {
      if (!isAuthorized(getAccessCode(req))) {
        sendJson(res, 403, { ok: false, error: "Invalid access code." });
        return;
      }

      sendJson(res, 200, buildSequencePayload());
      return;
    }

    if (pathname === "/api/tambola/action" && req.method === "POST") {
      const body = await parseJsonBody(req);
      if (!isAuthorized(getAccessCode(req, body))) {
        sendJson(res, 403, { ok: false, error: "Invalid access code." });
        return;
      }

      const payload = await handleTambolaAction(body);
      sendJson(res, 200, payload);
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
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: "Server error", detail: message });
  }
});

server.listen(port, host, () => {
  console.log(`Tambola caller running on http://${host}:${port}`);
});
