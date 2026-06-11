import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const kokoroRoot = "https://hexgrad-kokoro-tts.hf.space/gradio_api";
const kokoroFnIndex = 4;
const kokoroTriggerId = 2;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"]
]);

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseSseData(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
}

async function handleSpeech(request, response) {
  const body = await readJsonBody(request);
  const input = String(body.input || "").trim();
  const voice = String(body.voice || "af_heart");
  const speed = clamp(Number(body.speed) || 1, 0.5, 2);

  if (!input) {
    sendJson(response, 400, { error: { message: "Missing text input." } });
    return;
  }

  const sessionHash = `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const queueBody = {
    data: [input, voice, speed, false],
    event_data: null,
    fn_index: kokoroFnIndex,
    trigger_id: kokoroTriggerId,
    session_hash: sessionHash
  };

  const join = await fetch(`${kokoroRoot}/queue/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(queueBody)
  });

  if (!join.ok) {
    sendJson(response, join.status, { error: { message: "Kokoro queue failed to start." } });
    return;
  }

  const stream = await fetch(`${kokoroRoot}/queue/data?session_hash=${encodeURIComponent(sessionHash)}`);
  const streamText = await stream.text();
  const events = parseSseData(streamText);
  const completed = events.find((event) => event.msg === "process_completed");

  if (!completed?.success) {
    const message = completed?.output?.error || "Kokoro generation failed. The free Space may be busy or sleeping.";
    sendJson(response, 502, { error: { message } });
    return;
  }

  const audioUrl = completed.output?.data?.[0]?.url;
  if (!audioUrl) {
    sendJson(response, 502, { error: { message: "Kokoro did not return an audio file." } });
    return;
  }

  const audio = await fetch(audioUrl);
  const buffer = Buffer.from(await audio.arrayBuffer());

  if (!audio.ok) {
    sendJson(response, audio.status, { error: { message: "Could not download Kokoro audio." } });
    return;
  }

  response.writeHead(200, {
    "Content-Type": audio.headers.get("content-type") || "audio/wav",
    "Cache-Control": "no-store"
  });
  response.end(buffer);
}

async function handleStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const candidate = normalize(join(root, pathname));

  if (!candidate.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(candidate);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extname(candidate)) || "application/octet-stream"
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.url === "/api/health") {
      sendJson(response, 200, {
        provider: "kokoro",
        available: true,
        configured: true
      });
      return;
    }

    if (request.url === "/api/speech" && request.method === "POST") {
      await handleSpeech(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await handleStatic(request, response);
      return;
    }

    response.writeHead(405);
    response.end("Method not allowed");
  } catch (error) {
    sendJson(response, 500, { error: { message: error.message || "Server error" } });
  }
});

server.listen(port, host, () => {
  console.log(`Sentence Reactor listening on http://${host}:${port}/`);
});
